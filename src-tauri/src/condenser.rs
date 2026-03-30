use crate::docker::DefinerOverride;
use crate::error::AppError;
use crate::parser::{self, LineType};
use crate::progress::{Phase, ProgressTracker};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::PathBuf;
use tauri::AppHandle;

/// Hard upper limit for IncludeLastN to prevent OOM on wide tables.
/// 100K rows is generous for any reasonable "tail sampling" use case.
const MAX_LAST_N: u64 = 100_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CondenseConfig {
    pub source_path: PathBuf,
    pub output_path: PathBuf,
    pub table_configs: HashMap<String, TableAction>,
    #[serde(default)]
    pub definer_override: Option<DefinerOverride>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", content = "n")]
pub enum TableAction {
    #[serde(rename = "include_all")]
    IncludeAll,
    #[serde(rename = "include_last_n")]
    IncludeLastN(u64),
    #[serde(rename = "exclude_data")]
    ExcludeData,
}

struct RollingBuffer {
    max_rows: u64,
    tuples: VecDeque<String>,
    insert_prefix: String,
}

impl RollingBuffer {
    fn new(max_rows: u64) -> Self {
        Self {
            max_rows,
            tuples: VecDeque::new(),
            insert_prefix: String::new(),
        }
    }

    fn add_tuples(&mut self, insert_line: &str) {
        // Extract the prefix on first encounter
        if self.insert_prefix.is_empty() {
            if let Some(prefix) = parser::extract_insert_prefix(insert_line) {
                self.insert_prefix = prefix.to_string();
            }
        }

        if let Some(values) = parser::extract_values_portion(insert_line) {
            let parsed = parser::parse_tuples(values);
            for tuple in parsed {
                self.tuples.push_back(tuple);
                while self.tuples.len() as u64 > self.max_rows {
                    self.tuples.pop_front();
                }
            }
        }
    }

    fn flush_to<W: Write>(&self, writer: &mut W) -> Result<bool, std::io::Error> {
        if self.tuples.is_empty() || self.insert_prefix.is_empty() {
            return Ok(false);
        }
        writer.write_all(self.insert_prefix.as_bytes())?;
        for (i, tuple) in self.tuples.iter().enumerate() {
            if i > 0 {
                writer.write_all(b",")?;
            }
            writer.write_all(tuple.as_bytes())?;
        }
        writer.write_all(b";\n")?;
        Ok(true)
    }
}

pub fn condense(config: &CondenseConfig, app: &AppHandle) -> Result<PathBuf, AppError> {
    let source = std::fs::File::open(&config.source_path)?;
    let file_size = source.metadata()?.len();
    let mut reader = BufReader::with_capacity(8 * 1024 * 1024, source);

    let output = std::fs::File::create(&config.output_path)?;
    let mut writer = BufWriter::with_capacity(8 * 1024 * 1024, output);

    let mut rolling_buffers: HashMap<String, RollingBuffer> = HashMap::new();

    // Pre-create rolling buffers for IncludeLastN tables (clamped to MAX_LAST_N)
    for (table, action) in &config.table_configs {
        if let TableAction::IncludeLastN(n) = action {
            rolling_buffers.insert(table.clone(), RollingBuffer::new((*n).min(MAX_LAST_N)));
        }
    }

    let mut bytes_read: u64 = 0;
    let mut tracker = ProgressTracker::new(Phase::Condensing, file_size);
    let mut current_table: Option<String> = None;

    // Closure to apply definer replacement if configured
    let transform_line = |line: &str| -> String {
        if let Some(ref d) = config.definer_override {
            if line.contains("DEFINER=") {
                return crate::docker::replace_definer(line, &d.user, &d.host);
            }
        }
        line.to_string()
    };

    let mut line_buf = String::new();
    loop {
        line_buf.clear();
        let bytes_this_line = reader.read_line(&mut line_buf)?;
        if bytes_this_line == 0 {
            break; // EOF
        }
        bytes_read += bytes_this_line as u64;
        let line = line_buf.trim_end_matches(&['\n', '\r'][..]);

        let line_type = parser::classify_line(line);

        match &line_type {
            LineType::InsertInto(table_name) => {
                current_table = Some(table_name.clone());
                let action = config
                    .table_configs
                    .get(table_name)
                    .cloned()
                    .unwrap_or(TableAction::IncludeAll);

                match action {
                    TableAction::IncludeAll => {
                        writeln!(writer, "{}", transform_line(&line))?;
                    }
                    TableAction::ExcludeData => {
                        // Skip this INSERT line entirely
                    }
                    TableAction::IncludeLastN(_) => {
                        // Buffer tuples
                        if let Some(buffer) = rolling_buffers.get_mut(table_name) {
                            buffer.add_tuples(&line);
                        }
                    }
                }
            }
            LineType::UnlockTables => {
                // Before writing UNLOCK, flush any pending rolling buffer
                // (INSERT data never contains DEFINER=, so no transform needed)
                if let Some(ref table) = current_table {
                    if let Some(buffer) = rolling_buffers.get(table) {
                        buffer.flush_to(&mut writer)?;
                    }
                    // Clear the buffer after flushing
                    if let Some(buffer) = rolling_buffers.get_mut(table) {
                        buffer.tuples.clear();
                    }
                }
                writeln!(writer, "{}", transform_line(&line))?;
                current_table = None;
            }
            LineType::DropTable(table_name) => {
                // Flush buffer if we're transitioning to a new table section
                if let Some(ref prev_table) = current_table {
                    if prev_table != table_name {
                        if let Some(buffer) = rolling_buffers.get(prev_table) {
                            buffer.flush_to(&mut writer)?;
                        }
                        if let Some(buffer) = rolling_buffers.get_mut(prev_table) {
                            buffer.tuples.clear();
                        }
                    }
                }
                current_table = Some(table_name.clone());
                writeln!(writer, "{}", transform_line(&line))?;
            }
            _ => {
                // All non-INSERT lines pass through (DDL, views, procedures, etc.)
                writeln!(writer, "{}", transform_line(&line))?;
            }
        }

        if tracker.should_emit(bytes_read) {
            let msg = if let Some(ref t) = current_table {
                format!("Condensing... Processing table: {}", t)
            } else {
                "Condensing...".to_string()
            };
            tracker.emit(app, bytes_read, &msg);
        }
    }

    // Flush any remaining buffers (edge case: file doesn't end with UNLOCK)
    // Sort by table name for deterministic output order
    let mut remaining_tables: Vec<&String> = rolling_buffers.keys().collect();
    remaining_tables.sort();
    for table_name in remaining_tables {
        if let Some(buffer) = rolling_buffers.get(table_name) {
            buffer.flush_to(&mut writer)?;
        }
    }

    writer.flush()?;
    tracker.emit_complete(app, "Condensing complete.");

    Ok(config.output_path.clone())
}
