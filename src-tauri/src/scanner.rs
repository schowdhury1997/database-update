use crate::error::AppError;
use crate::parser::{self, LineType};
use crate::progress::{Phase, ProgressTracker};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::Path;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub tables: Vec<TableInfo>,
    pub fk_graph: ForeignKeyGraphData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub foreign_keys: Vec<ForeignKeyInfo>,
    pub estimated_data_bytes: u64,
    pub estimated_row_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForeignKeyInfo {
    pub column: String,
    pub references_table: String,
    pub references_column: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForeignKeyGraphData {
    pub dependencies: HashMap<String, Vec<String>>,
    pub dependents: HashMap<String, Vec<String>>,
}

pub fn scan_file(path: &Path, app: &AppHandle) -> Result<ScanResult, AppError> {
    let file = std::fs::File::open(path)?;
    let file_size = file.metadata()?.len();
    let mut reader = BufReader::with_capacity(8 * 1024 * 1024, file);

    let mut tables: Vec<TableInfo> = Vec::new();
    let mut table_map: HashMap<String, usize> = HashMap::new();
    let mut dependencies: HashMap<String, Vec<String>> = HashMap::new();
    let mut dependents: HashMap<String, Vec<String>> = HashMap::new();

    let mut current_create_table: Option<String> = None;
    let mut current_columns: Vec<String> = Vec::new();
    let mut current_fks: Vec<ForeignKeyInfo> = Vec::new();

    let mut bytes_read: u64 = 0;
    let mut tracker = ProgressTracker::new(Phase::Scanning, file_size);

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

        match line_type {
            LineType::CreateTable(name) => {
                current_create_table = Some(name);
                current_columns.clear();
                current_fks.clear();
            }
            LineType::CreateTableEnd => {
                if let Some(ref table_name) = current_create_table {
                    let idx = tables.len();
                    table_map.insert(table_name.clone(), idx);

                    // Register FK dependencies
                    for fk in &current_fks {
                        dependencies
                            .entry(table_name.clone())
                            .or_default()
                            .push(fk.references_table.clone());
                        dependents
                            .entry(fk.references_table.clone())
                            .or_default()
                            .push(table_name.clone());
                    }

                    tables.push(TableInfo {
                        name: table_name.clone(),
                        columns: current_columns.clone(),
                        foreign_keys: current_fks.clone(),
                        estimated_data_bytes: 0,
                        estimated_row_count: 0,
                    });
                    current_create_table = None;
                }
            }
            LineType::ForeignKey(fk_def) => {
                current_fks.push(ForeignKeyInfo {
                    column: fk_def.column,
                    references_table: fk_def.references_table,
                    references_column: fk_def.references_column,
                });
            }
            LineType::InsertInto(ref table_name) => {
                let data_bytes = line.len() as u64;
                // Count approximate rows by counting ),( patterns and trailing );
                let row_count = count_tuples_approx(line);

                if let Some(&idx) = table_map.get(table_name) {
                    tables[idx].estimated_data_bytes += data_bytes;
                    tables[idx].estimated_row_count += row_count;
                }
            }
            _ => {
                // Inside CREATE TABLE, try to extract column names
                if current_create_table.is_some() {
                    let trimmed = line.trim();
                    if trimmed.starts_with('`') {
                        if let Some(end) = trimmed[1..].find('`') {
                            current_columns.push(trimmed[1..end + 1].to_string());
                        }
                    }
                }
            }
        }

        if tracker.should_emit(bytes_read) {
            let table_count = tables.len();
            tracker.emit(
                app,
                bytes_read,
                &format!("Scanning... Found {} tables so far", table_count),
            );
        }
    }

    tracker.emit_complete(
        app,
        &format!("Scan complete. Found {} tables.", tables.len()),
    );

    Ok(ScanResult {
        tables,
        fk_graph: ForeignKeyGraphData {
            dependencies,
            dependents,
        },
    })
}

/// Approximate tuple count by counting "),(" and the final ");"
fn count_tuples_approx(line: &str) -> u64 {
    if !line.contains("VALUES") {
        return 0;
    }
    let bytes = line.as_bytes();
    let mut count: u64 = 0;
    let mut in_string = false;
    let mut escape_next = false;

    let mut i = 0;
    while i < bytes.len() {
        if escape_next {
            escape_next = false;
            i += 1;
            continue;
        }
        if in_string {
            match bytes[i] {
                b'\\' => escape_next = true,
                b'\'' => {
                    if i + 1 < bytes.len() && bytes[i + 1] == b'\'' {
                        // Doubled-quote escape: skip both quotes, stay in string
                        i += 2;
                        continue;
                    } else {
                        in_string = false;
                    }
                }
                _ => {}
            }
            i += 1;
            continue;
        }
        match bytes[i] {
            b'\'' => in_string = true,
            b')' => {
                // Check if followed by ',' or ';' (tuple boundary)
                if i + 1 < bytes.len() && (bytes[i + 1] == b',' || bytes[i + 1] == b';') {
                    count += 1;
                }
            }
            _ => {}
        }
        i += 1;
    }
    count
}
