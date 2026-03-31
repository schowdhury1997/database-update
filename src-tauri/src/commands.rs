use crate::condenser::CondenseConfig;
use crate::docker::DockerConfig;
use crate::error::AppError;
use crate::fk_graph::ForeignKeyGraph;
use crate::scanner::ScanResult;
use crate::templates::Template;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct PreflightStatus {
    pub docker_available: bool,
    pub compose_file_exists: bool,
    pub container_running: bool,
    pub errors: Vec<String>,
}

#[tauri::command]
pub async fn scan_file(path: String, app: tauri::AppHandle) -> Result<ScanResult, AppError> {
    let path = PathBuf::from(path);
    tokio::task::spawn_blocking(move || crate::scanner::scan_file(&path, &app))
        .await
        .map_err(|e| AppError::Scanner(e.to_string()))?
}

#[tauri::command]
pub fn compute_fk_locks(
    fk_graph_data: crate::scanner::ForeignKeyGraphData,
    checked_tables: Vec<String>,
) -> Vec<crate::fk_graph::FkLockInfo> {
    let graph = ForeignKeyGraph::from_scan_data(&fk_graph_data);
    let checked: HashSet<String> = checked_tables.into_iter().collect();
    graph.compute_locks(&checked)
}

#[tauri::command]
pub fn compute_cascade_uncheck(
    fk_graph_data: crate::scanner::ForeignKeyGraphData,
    checked_tables: Vec<String>,
    target_table: String,
) -> Vec<crate::fk_graph::CascadeEntry> {
    let graph = ForeignKeyGraph::from_scan_data(&fk_graph_data);
    let checked: HashSet<String> = checked_tables.into_iter().collect();
    graph.compute_cascade_uncheck(&target_table, &checked)
}

#[tauri::command]
pub async fn condense(config: CondenseConfig, app: tauri::AppHandle) -> Result<String, AppError> {
    let result = tokio::task::spawn_blocking(move || crate::condenser::condense(&config, &app))
        .await
        .map_err(|e| AppError::Condenser(e.to_string()))??;
    Ok(result.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn run_sql(
    docker_config: DockerConfig,
    sql_path: String,
    app: tauri::AppHandle,
) -> Result<Vec<String>, AppError> {
    let path = PathBuf::from(sql_path);
    crate::docker::run_sql(&docker_config, &path, &app).await
}

#[tauri::command]
pub fn preflight_check(docker_config: DockerConfig) -> PreflightStatus {
    let result = crate::docker::preflight_check(&docker_config);
    PreflightStatus {
        docker_available: result.docker_available,
        compose_file_exists: result.compose_file_exists,
        container_running: result.container_running,
        errors: result.errors,
    }
}

#[tauri::command]
pub async fn download_from_s3(
    s3_uri: String,
    download_dir: String,
    profile: Option<String>,
    app: tauri::AppHandle,
) -> Result<String, AppError> {
    let app_support = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("~"))
        .join("database-update");
    let result = crate::s3::download_from_s3(
        &s3_uri,
        &PathBuf::from(&download_dir),
        profile.as_deref(),
        &app_support,
        &app,
    )
    .await?;
    Ok(result.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn extract_gz(path: String, app: tauri::AppHandle) -> Result<String, AppError> {
    let path = PathBuf::from(path);
    let result =
        tokio::task::spawn_blocking(move || crate::extractor::extract_gz(&path, &app))
            .await
            .map_err(|e| AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))??;
    Ok(result.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn check_aws_credentials(profile: Option<String>) -> Result<bool, AppError> {
    crate::s3::check_profile_credentials(profile.as_deref()).await
}

#[tauri::command]
pub fn has_env_credentials() -> bool {
    let app_support = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("~"))
        .join("database-update");
    crate::s3::has_env_credentials(&app_support)
}

#[tauri::command]
pub fn list_aws_profiles() -> Vec<String> {
    crate::s3::list_aws_profiles()
}

// Template commands

#[tauri::command]
pub fn list_templates() -> Result<Vec<Template>, AppError> {
    crate::templates::list_templates()
}

#[tauri::command]
pub fn save_template(template: Template) -> Result<(), AppError> {
    crate::templates::save_template(&template)
}

#[tauri::command]
pub fn load_template(name: String) -> Result<Template, AppError> {
    crate::templates::load_template(&name)
}

#[tauri::command]
pub fn delete_template(name: String) -> Result<(), AppError> {
    crate::templates::delete_template(&name)
}

#[tauri::command]
pub fn import_template(path: String) -> Result<Template, AppError> {
    crate::templates::import_template(&PathBuf::from(path))
}

#[tauri::command]
pub fn export_template(name: String, path: String) -> Result<(), AppError> {
    crate::templates::export_template(&name, &PathBuf::from(path))
}

// Schedule commands

#[tauri::command]
pub fn list_schedules() -> Result<Vec<crate::scheduler::ScheduledTask>, AppError> {
    crate::scheduler::list_schedules()
}

#[tauri::command]
pub fn create_schedule(
    name: String,
    template_name: String,
    source_path: Option<String>,
    action: crate::scheduler::ScheduleAction,
    schedule: crate::scheduler::Schedule,
) -> Result<crate::scheduler::ScheduledTask, AppError> {
    // Use current executable as the binary path
    let binary_path = std::env::current_exe()
        .map_err(|e| AppError::Scheduler(e.to_string()))?
        .to_string_lossy()
        .to_string();
    crate::scheduler::create_schedule(
        &name,
        &template_name,
        source_path.as_deref(),
        action,
        schedule,
        &binary_path,
    )
}

#[tauri::command]
pub fn delete_schedule(id: String) -> Result<(), AppError> {
    crate::scheduler::delete_schedule(&id)
}

// Preferences

#[tauri::command]
pub fn get_preferences() -> Result<Preferences, AppError> {
    load_preferences()
}

#[tauri::command]
pub fn save_preferences(prefs: Preferences) -> Result<(), AppError> {
    save_preferences_to_disk(&prefs)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Preferences {
    pub download_directory: String,
    pub recent_files: Vec<String>,
    pub recent_s3_uris: Vec<String>,
    #[serde(default)]
    pub default_compose_file_path: String,
    #[serde(default)]
    pub default_service_name: String,
    #[serde(default)]
    pub default_output_directory: String,
    #[serde(default)]
    pub recent_database_names: Vec<String>,
}

impl Default for Preferences {
    fn default() -> Self {
        let download_dir = dirs::home_dir()
            .unwrap_or_default()
            .join("Downloads/database-update");
        Self {
            download_directory: download_dir.to_string_lossy().to_string(),
            recent_files: Vec::new(),
            recent_s3_uris: Vec::new(),
            default_compose_file_path: String::new(),
            default_service_name: String::new(),
            default_output_directory: String::new(),
            recent_database_names: Vec::new(),
        }
    }
}

fn preferences_path() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("~"))
        .join("database-update")
        .join("preferences.json")
}

fn load_preferences() -> Result<Preferences, AppError> {
    let path = preferences_path();
    if !path.exists() {
        return Ok(Preferences::default());
    }
    let content = std::fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&content).unwrap_or_default())
}

fn save_preferences_to_disk(prefs: &Preferences) -> Result<(), AppError> {
    let path = preferences_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(prefs)?;
    std::fs::write(&path, json)?;
    Ok(())
}
