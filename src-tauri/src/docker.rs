use crate::error::AppError;
use crate::progress::{Phase, ProgressTracker};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerConfig {
    pub compose_file_path: PathBuf,
    pub service_name: String,
    pub database_name: String,
}

impl Default for DockerConfig {
    fn default() -> Self {
        Self {
            compose_file_path: PathBuf::new(),
            service_name: "mysql".to_string(),
            database_name: String::new(),
        }
    }
}

pub struct PreflightResult {
    pub docker_available: bool,
    pub pv_available: bool,
    pub compose_file_exists: bool,
    pub container_running: bool,
    pub errors: Vec<String>,
}

/// Run pre-flight checks before importing SQL.
pub fn preflight_check(config: &DockerConfig) -> PreflightResult {
    let mut result = PreflightResult {
        docker_available: false,
        pv_available: false,
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

    // Check pv
    if std::process::Command::new("pv")
        .arg("--version")
        .output()
        .is_ok()
    {
        result.pv_available = true;
    } else {
        result
            .errors
            .push("'pv' is not installed. Install with: brew install pv".into());
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

/// Import a SQL file into MySQL via Docker Compose using pv for progress.
pub async fn run_sql(
    config: &DockerConfig,
    sql_path: &Path,
    app: &AppHandle,
) -> Result<(), AppError> {
    let file_size = std::fs::metadata(sql_path)?.len();
    let mut tracker = ProgressTracker::new(Phase::Importing, file_size);

    let cmd_str = format!(
        "pv -f -n '{}' | docker compose -f '{}' exec -T {} mysql {}",
        sql_path.display(),
        config.compose_file_path.display(),
        config.service_name,
        config.database_name,
    );

    let mut child = std::process::Command::new("sh")
        .args(["-c", &cmd_str])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Docker(format!("Failed to spawn import process: {}", e)))?;

    // pv with -n flag outputs progress as percentage to stderr, one number per line
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Docker("Failed to capture stderr".into()))?;

    let stderr_reader = std::io::BufReader::new(stderr);
    use std::io::BufRead;
    for line in stderr_reader.lines() {
        if let Ok(line) = line {
            // pv -n outputs percentage as integer per line
            if let Ok(pct) = line.trim().parse::<f64>() {
                let bytes_est = (pct / 100.0 * file_size as f64) as u64;
                if tracker.should_emit(bytes_est) {
                    tracker.emit(
                        app,
                        bytes_est,
                        &format!("Importing to MySQL... {:.0}%", pct),
                    );
                }
            }
        }
    }

    let status = child
        .wait()
        .map_err(|e| AppError::Docker(format!("Import process error: {}", e)))?;

    if !status.success() {
        return Err(AppError::Docker(format!(
            "Import failed with exit code: {}",
            status.code().unwrap_or(-1)
        )));
    }

    tracker.emit_complete(app, "Import complete.");
    Ok(())
}
