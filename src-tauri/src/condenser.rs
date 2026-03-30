use crate::error::AppError;
use crate::parser::{self, LineType};
use crate::progress::{Phase, ProgressTracker};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::PathBuf;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CondenseConfig {
    pub source_path: PathBuf,
    pub output_path: PathBuf,
    pub table_configs: HashMap<String, TableAction>,
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

    fn flush(&self) -> Option<String> {
        if self.tuples.is_empty() || self.insert_prefix.is_empty() {
            return None;
        }
        let joined: Vec<&str> = self.tuples.iter().map(|s| s.as_str()).collect();
        Some(format!("{}{};", self.insert_prefix, joined.join(",")))
    }
}

pub fn condense(config: &CondenseConfig, app: &AppHandle) -> Result<PathBuf, AppError> {
    let source = std::fs::File::open(&config.source_path)?;
    let file_size = source.metadata()?.len();
    let reader = BufReader::with_capacity(8 * 1024 * 1024, source);

    let output = std::fs::File::create(&config.output_path)?;
    let mut writer = BufWriter::with_capacity(8 * 1024 * 1024, output);

    let mut rolling_buffers: HashMap<String, RollingBuffer> = HashMap::new();

    // Pre-create rolling buffers for IncludeLastN tables
    for (table, action) in &config.table_configs {
        if let TableAction::IncludeLastN(n) = action {
            rolling_buffers.insert(table.clone(), RollingBuffer::new(*n));
        }
    }

    let mut bytes_read: u64 = 0;
    let mut tracker = ProgressTracker::new(Phase::Condensing, file_size);
    let mut current_table: Option<String> = None;

    for line_result in reader.lines() {
        let line = line_result?;
        let line_bytes = line.len() as u64 + 1;
        bytes_read += line_bytes;

        let line_type = parser::classify_line(&line);

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
                        writeln!(writer, "{}", line)?;
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
                if let Some(ref table) = current_table {
                    if let Some(buffer) = rolling_buffers.get(table) {
                        if let Some(insert_stmt) = buffer.flush() {
                            writeln!(writer, "{}", insert_stmt)?;
                        }
                    }
                    // Clear the buffer after flushing
                    if let Some(buffer) = rolling_buffers.get_mut(table) {
                        buffer.tuples.clear();
                    }
                }
                writeln!(writer, "{}", line)?;
                current_table = None;
            }
            LineType::DropTable(table_name) => {
                // Flush buffer if we're transitioning to a new table section
                if let Some(ref prev_table) = current_table {
                    if prev_table != table_name {
                        if let Some(buffer) = rolling_buffers.get(prev_table) {
                            if let Some(insert_stmt) = buffer.flush() {
                                writeln!(writer, "{}", insert_stmt)?;
                            }
                        }
                        if let Some(buffer) = rolling_buffers.get_mut(prev_table) {
                            buffer.tuples.clear();
                        }
                    }
                }
                current_table = Some(table_name.clone());
                writeln!(writer, "{}", line)?;
            }
            _ => {
                // All non-INSERT lines pass through (DDL, views, procedures, etc.)
                writeln!(writer, "{}", line)?;
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
    for (_, buffer) in &rolling_buffers {
        if let Some(insert_stmt) = buffer.flush() {
            writeln!(writer, "{}", insert_stmt)?;
        }
    }

    writer.flush()?;
    tracker.emit_complete(app, "Condensing complete.");

    Ok(config.output_path.clone())
}
