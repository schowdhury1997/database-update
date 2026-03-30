use crate::error::AppError;
use crate::progress::{Phase, ProgressTracker};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefinerOverride {
    pub user: String,
    pub host: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerConfig {
    pub compose_file_path: PathBuf,
    pub service_name: String,
    pub database_name: String,
    #[serde(default)]
    pub definer_override: Option<DefinerOverride>,
    #[serde(default)]
    pub drop_existing_data: bool,
}

impl Default for DockerConfig {
    fn default() -> Self {
        Self {
            compose_file_path: PathBuf::new(),
            service_name: "mysql".to_string(),
            database_name: String::new(),
            definer_override: None,
            drop_existing_data: false,
        }
    }
}

/// Extract the table name from a `CREATE TABLE` line.
/// Handles both `CREATE TABLE `name`` and `CREATE TABLE IF NOT EXISTS `name``.
fn extract_create_table_name(line: &str) -> Option<String> {
    let upper = line.to_uppercase();
    let after = if let Some(pos) = upper.find("CREATE TABLE IF NOT EXISTS") {
        &line[pos + 26..]
    } else if let Some(pos) = upper.find("CREATE TABLE") {
        &line[pos + 12..]
    } else {
        return None;
    };

    let trimmed = after.trim_start();
    if trimmed.starts_with('`') {
        let end = trimmed[1..].find('`')?;
        Some(trimmed[1..end + 1].to_string())
    } else {
        let end = trimmed
            .find(|c: char| c.is_whitespace() || c == '(')
            .unwrap_or(trimmed.len());
        if end == 0 {
            return None;
        }
        Some(trimmed[..end].to_string())
    }
}

/// Extract the view name from a CREATE VIEW or CREATE ALGORITHM=... VIEW line.
fn extract_create_view_name(line: &str) -> Option<String> {
    let upper = line.to_uppercase();
    // Find " VIEW " after CREATE (handles CREATE VIEW, CREATE OR REPLACE VIEW,
    // CREATE ALGORITHM=... DEFINER=... SQL SECURITY ... VIEW)
    let view_pos = upper.find(" VIEW ")?;
    // Only match if there's a CREATE before VIEW
    let before = &upper[..view_pos];
    if !before.contains("CREATE") {
        return None;
    }
    let after = &line[view_pos + 6..]; // after " VIEW "
    let trimmed = after.trim_start();
    if trimmed.starts_with('`') {
        let end = trimmed[1..].find('`')?;
        Some(trimmed[1..end + 1].to_string())
    } else {
        let end = trimmed
            .find(|c: char| c.is_whitespace() || c == '(')
            .unwrap_or(trimmed.len());
        if end == 0 {
            return None;
        }
        Some(trimmed[..end].to_string())
    }
}

pub struct PreflightResult {
    pub docker_available: bool,
    pub compose_file_exists: bool,
    pub container_running: bool,
    pub errors: Vec<String>,
}

/// Replace DEFINER=`user`@`host` with the override values in a line.
pub fn replace_definer(line: &str, user: &str, host: &str) -> String {
    let replacement = format!("DEFINER=`{}`@`{}`", user, host);
    let mut result = String::with_capacity(line.len());
    let mut remaining = line;

    while let Some(idx) = remaining.find("DEFINER=") {
        result.push_str(&remaining[..idx]);
        let after = &remaining[idx + 8..]; // after "DEFINER="

        if let Some(end) = find_definer_end(after) {
            result.push_str(&replacement);
            remaining = &after[end..];
        } else {
            result.push_str("DEFINER=");
            remaining = after;
        }
    }
    result.push_str(remaining);
    result
}

/// Find the end position of a `user`@`host` pattern.
fn find_definer_end(s: &str) -> Option<usize> {
    if !s.starts_with('`') {
        return None;
    }
    let end_user = s[1..].find('`')? + 2;
    if !s[end_user..].starts_with('@') {
        return None;
    }
    let after_at = end_user + 1;
    if !s[after_at..].starts_with('`') {
        return None;
    }
    let end_host = s[after_at + 1..].find('`')? + after_at + 2;
    Some(end_host)
}

/// Run pre-flight checks before importing SQL.
pub fn preflight_check(config: &DockerConfig) -> PreflightResult {
    let mut result = PreflightResult {
        docker_available: false,
        compose_file_exists: false,
        container_running: false,
        errors: Vec::new(),
    };

    // Check docker
    if std::process::Command::new("docker")
        .arg("--version")
        .output()
        .is_ok()
    {
        result.docker_available = true;
    } else {
        result
            .errors
            .push("Docker CLI is not available. Install Docker Desktop.".into());
    }

    // Check compose file
    if config.compose_file_path.exists() {
        result.compose_file_exists = true;
    } else {
        result.errors.push(format!(
            "Docker Compose file not found at: {}",
            config.compose_file_path.display()
        ));
    }

    // Check container running
    if result.docker_available && result.compose_file_exists {
        if let Ok(output) = std::process::Command::new("docker")
            .args([
                "compose",
                "-f",
                &config.compose_file_path.to_string_lossy(),
                "ps",
                "--status",
                "running",
                &config.service_name,
            ])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.contains(&config.service_name) {
                result.container_running = true;
            } else {
                result.errors.push(format!(
                    "MySQL container '{}' is not running. Start it with: docker compose -f {} up -d {}",
                    config.service_name,
                    config.compose_file_path.display(),
                    config.service_name
                ));
            }
        }
    }

    result
}

/// Import a SQL file into MySQL via Docker Compose, streaming through Rust
/// for progress tracking, definer replacement, and proper error capture.
pub async fn run_sql(
    config: &DockerConfig,
    sql_path: &Path,
    app: &AppHandle,
) -> Result<Vec<String>, AppError> {
    let file_size = std::fs::metadata(sql_path)?.len();
    let mut tracker = ProgressTracker::new(Phase::Importing, file_size);

    // Spawn docker compose exec with piped stdin/stderr
    let mut child = std::process::Command::new("docker")
        .args([
            "compose",
            "-f",
            &config.compose_file_path.to_string_lossy(),
            "exec",
            "-T",
            &config.service_name,
            "mysql",
            &config.database_name,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Docker(format!("Failed to spawn import process: {}", e)))?;

    // Collect stderr from mysql in a separate thread
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Docker("Failed to capture stderr".into()))?;

    let stderr_handle = std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        let mut lines = Vec::new();
        for line in reader.lines().map_while(Result::ok) {
            let trimmed = line.trim().to_string();
            if !trimmed.is_empty() {
                lines.push(trimmed);
            }
        }
        lines
    });

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppError::Docker("Failed to capture stdin".into()))?;

    // Disable FK checks for the duration of the import to prevent deadlocks
    // from InnoDB's FK validation during INSERT operations with LOCK TABLES.
    // This is safe because the dump contains a complete FK-consistent dataset.
    stdin
        .write_all(b"SET FOREIGN_KEY_CHECKS=0;\n")
        .map_err(|e| AppError::Docker(format!("Failed to write import preamble: {}", e)))?;

    let file = std::fs::File::open(sql_path)?;
    let mut bytes_read: u64 = 0;

    let needs_line_processing =
        config.definer_override.is_some() || config.drop_existing_data;

    if needs_line_processing {
        // Line-by-line streaming with optional transformations
        let reader = BufReader::with_capacity(8 * 1024 * 1024, file);
        let definer = config.definer_override.as_ref();
        let fix_creates = config.drop_existing_data;
        let mut inside_lock = false;

        for line_result in reader.lines() {
            let line = line_result?;
            bytes_read += line.len() as u64 + 1;

            let mut output_line = line;

            // Track LOCK/UNLOCK state — DDL (DROP/CREATE) is forbidden inside
            // LOCK TABLES blocks, so we must skip injection while locked.
            {
                let trimmed_upper = output_line.trim_start().to_uppercase();
                if trimmed_upper.starts_with("LOCK TABLES") {
                    inside_lock = true;
                } else if trimmed_upper.starts_with("UNLOCK TABLES") {
                    inside_lock = false;
                }
            }

            if let Some(d) = definer {
                if output_line.contains("DEFINER=") {
                    output_line = replace_definer(&output_line, &d.user, &d.host);
                }
            }

            if fix_creates && !inside_lock {
                let upper = output_line.to_uppercase();
                if upper.contains("CREATE TABLE ") {
                    // Inject DROP TABLE IF EXISTS before each CREATE TABLE so existing
                    // tables are replaced cleanly. Done inline (not in a preamble) to
                    // avoid dropping objects the dump references before recreating.
                    if let Some(table_name) = extract_create_table_name(&output_line) {
                        let _ = writeln!(stdin, "DROP TABLE IF EXISTS `{}`;", table_name);
                    }
                    // Also add IF NOT EXISTS as a safety net in case the DROP injection
                    // fails (e.g., table name couldn't be extracted). This makes duplicate
                    // or guard-less CREATE TABLE statements harmless.
                    if !upper.contains("IF NOT EXISTS") {
                        output_line = output_line.replacen("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", 1);
                        // Handle lowercase variant
                        if !output_line.contains("IF NOT EXISTS") {
                            output_line = output_line.replacen("create table ", "create table IF NOT EXISTS ", 1);
                        }
                    }
                } else if upper.contains(" VIEW ") && upper.contains("CREATE") {
                    // Inject DROP VIEW IF EXISTS before CREATE VIEW statements
                    if let Some(view_name) = extract_create_view_name(&output_line) {
                        let _ = writeln!(stdin, "DROP VIEW IF EXISTS `{}`;", view_name);
                    }
                }
            }

            if writeln!(stdin, "{}", output_line).is_err() {
                // mysql process likely died — break and let exit code handling report the error
                break;
            }

            if tracker.should_emit(bytes_read) {
                let pct = (bytes_read as f64 / file_size as f64) * 100.0;
                tracker.emit(
                    app,
                    bytes_read,
                    &format!("Importing to MySQL... {:.0}%", pct),
                );
            }
        }
    } else {
        // Raw byte streaming for maximum efficiency (no line parsing needed)
        let mut reader = BufReader::with_capacity(8 * 1024 * 1024, file);
        let mut buf = vec![0u8; 8 * 1024 * 1024];

        loop {
            let n = reader
                .read(&mut buf)
                .map_err(|e| AppError::Docker(format!("Failed to read SQL file: {}", e)))?;
            if n == 0 {
                break;
            }
            if stdin.write_all(&buf[..n]).is_err() {
                break;
            }
            bytes_read += n as u64;

            if tracker.should_emit(bytes_read) {
                let pct = (bytes_read as f64 / file_size as f64) * 100.0;
                tracker.emit(
                    app,
                    bytes_read,
                    &format!("Importing to MySQL... {:.0}%", pct),
                );
            }
        }
    }

    // Re-enable FK checks after the import, then close stdin
    let _ = stdin.write_all(b"\nSET FOREIGN_KEY_CHECKS=1;\n");
    drop(stdin);

    let status = child
        .wait()
        .map_err(|e| AppError::Docker(format!("Import process error: {}", e)))?;

    let stderr_lines = stderr_handle.join().unwrap_or_default();

    if !status.success() {
        let error_detail = if stderr_lines.is_empty() {
            String::new()
        } else {
            format!("\n\nMySQL output:\n{}", stderr_lines.join("\n"))
        };
        return Err(AppError::Docker(format!(
            "Import failed with exit code: {}{}",
            status.code().unwrap_or(-1),
            error_detail
        )));
    }

    tracker.emit_complete(app, "Import complete.");
    Ok(stderr_lines)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_replace_definer_basic() {
        let line = "/*!50013 DEFINER=`root`@`production-host` SQL SECURITY DEFINER */";
        let result = replace_definer(line, "root", "localhost");
        assert_eq!(
            result,
            "/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */"
        );
    }

    #[test]
    fn test_replace_definer_create() {
        let line = "CREATE DEFINER=`admin`@`10.0.0.1` PROCEDURE `my_proc`()";
        let result = replace_definer(line, "rms", "localhost");
        assert_eq!(
            result,
            "CREATE DEFINER=`rms`@`localhost` PROCEDURE `my_proc`()"
        );
    }

    #[test]
    fn test_replace_definer_no_match() {
        let line = "INSERT INTO `users` VALUES (1, 'test');";
        let result = replace_definer(line, "root", "localhost");
        assert_eq!(result, line);
    }

    #[test]
    fn test_replace_definer_multiple() {
        let line = "DEFINER=`a`@`b` something DEFINER=`c`@`d`";
        let result = replace_definer(line, "root", "localhost");
        assert_eq!(
            result,
            "DEFINER=`root`@`localhost` something DEFINER=`root`@`localhost`"
        );
    }

    #[test]
    fn test_replace_definer_malformed_skipped() {
        let line = "DEFINER=broken something";
        let result = replace_definer(line, "root", "localhost");
        assert_eq!(result, line);
    }

    #[test]
    fn test_extract_create_table_backtick() {
        let line = "CREATE TABLE `users` (";
        assert_eq!(extract_create_table_name(line), Some("users".to_string()));
    }

    #[test]
    fn test_extract_create_table_if_not_exists() {
        let line = "CREATE TABLE IF NOT EXISTS `DATABASECHANGELOG` (";
        assert_eq!(
            extract_create_table_name(line),
            Some("DATABASECHANGELOG".to_string())
        );
    }

    #[test]
    fn test_extract_create_table_no_backtick() {
        let line = "CREATE TABLE my_table (";
        assert_eq!(
            extract_create_table_name(line),
            Some("my_table".to_string())
        );
    }

    #[test]
    fn test_extract_create_table_not_create() {
        let line = "INSERT INTO `users` VALUES (1);";
        assert_eq!(extract_create_table_name(line), None);
    }

    #[test]
    fn test_extract_create_table_name_at_end_of_line() {
        let line = "CREATE TABLE DATABASECHANGELOG";
        assert_eq!(
            extract_create_table_name(line),
            Some("DATABASECHANGELOG".to_string())
        );
    }

    #[test]
    fn test_extract_create_table_lowercase() {
        let line = "create table `DATABASECHANGELOG` (";
        assert_eq!(
            extract_create_table_name(line),
            Some("DATABASECHANGELOG".to_string())
        );
    }

    #[test]
    fn test_extract_create_view_simple() {
        let line = "CREATE VIEW `v_aliases` AS SELECT * FROM `aliases`";
        assert_eq!(
            extract_create_view_name(line),
            Some("v_aliases".to_string())
        );
    }

    #[test]
    fn test_extract_create_view_with_algorithm() {
        let line = "/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`%` SQL SECURITY DEFINER VIEW `my_view` AS select 1 */";
        assert_eq!(
            extract_create_view_name(line),
            Some("my_view".to_string())
        );
    }

    #[test]
    fn test_extract_create_view_not_view() {
        let line = "CREATE TABLE `users` (";
        assert_eq!(extract_create_view_name(line), None);
    }
}
