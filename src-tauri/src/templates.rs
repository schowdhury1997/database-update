use crate::condenser::TableAction;
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    pub name: String,
    pub database_name: String,
    pub compose_file_path: String,
    pub service_name: String,
    pub output_directory: String,
    pub s3_uri: Option<String>,
    pub aws_profile: Option<String>,
    pub download_directory: Option<String>,
    pub table_configs: HashMap<String, TableAction>,
    #[serde(default)]
    pub last_used: Option<String>,
}

fn templates_dir() -> PathBuf {
    let base = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("~"))
        .join("database-update")
        .join("templates");
    std::fs::create_dir_all(&base).ok();
    base
}

fn template_path(name: &str) -> PathBuf {
    let safe_name = name.replace(['/', '\\', ' '], "_");
    templates_dir().join(format!("{}.json", safe_name))
}

pub fn list_templates() -> Result<Vec<Template>, AppError> {
    let dir = templates_dir();
    let mut templates = Vec::new();

    if dir.exists() {
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(template) = serde_json::from_str::<Template>(&content) {
                        templates.push(template);
                    }
                }
            }
        }
    }

    templates.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(templates)
}

pub fn save_template(template: &Template) -> Result<(), AppError> {
    let path = template_path(&template.name);
    let json = serde_json::to_string_pretty(template)?;
    std::fs::write(&path, json)?;
    Ok(())
}

pub fn load_template(name: &str) -> Result<Template, AppError> {
    let path = template_path(name);
    if !path.exists() {
        return Err(AppError::Template(format!(
            "Template '{}' not found",
            name
        )));
    }
    let content = std::fs::read_to_string(&path)?;
    let template: Template = serde_json::from_str(&content)?;
    Ok(template)
}

pub fn delete_template(name: &str) -> Result<(), AppError> {
    let path = template_path(name);
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

pub fn export_template(name: &str, export_path: &Path) -> Result<(), AppError> {
    let template = load_template(name)?;
    let json = serde_json::to_string_pretty(&template)?;
    std::fs::write(export_path, json)?;
    Ok(())
}

pub fn import_template(import_path: &Path) -> Result<Template, AppError> {
    let content = std::fs::read_to_string(import_path)?;
    let template: Template = serde_json::from_str(&content)?;
    save_template(&template)?;
    Ok(template)
}
