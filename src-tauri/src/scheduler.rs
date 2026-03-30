use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledTask {
    pub id: String,
    pub name: String,
    pub template_name: String,
    pub source_path: Option<String>,
    pub action: ScheduleAction,
    pub schedule: Schedule,
    pub status: TaskStatus,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScheduleAction {
    Condense,
    Run,
    CondenseAndRun,
    FullPipeline,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schedule {
    pub schedule_type: ScheduleType,
    pub hour: u32,
    pub minute: u32,
    pub day_of_week: Option<u32>,
    pub year: Option<u32>,
    pub month: Option<u32>,
    pub day: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScheduleType {
    OneTime,
    Daily,
    Weekly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Active,
    Paused,
    Completed,
    Failed,
}

fn schedules_path() -> PathBuf {
    let base = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("~"))
        .join("database-update");
    std::fs::create_dir_all(&base).ok();
    base.join("schedules.json")
}

fn launch_agents_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_default();
    let dir = home.join("Library/LaunchAgents");
    std::fs::create_dir_all(&dir).ok();
    dir
}

fn logs_dir() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_default();
    let dir = home.join("Library/Logs/database-update");
    std::fs::create_dir_all(&dir).ok();
    dir
}

pub fn list_schedules() -> Result<Vec<ScheduledTask>, AppError> {
    let path = schedules_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path)?;
    let tasks: Vec<ScheduledTask> = serde_json::from_str(&content)?;
    Ok(tasks)
}

pub fn create_schedule(
    name: &str,
    template_name: &str,
    source_path: Option<&str>,
    action: ScheduleAction,
    schedule: Schedule,
    app_binary_path: &str,
) -> Result<ScheduledTask, AppError> {
    let id = Uuid::new_v4().to_string();
    let label = format!("com.database-update.task.{}", id);

    let task = ScheduledTask {
        id: id.clone(),
        name: name.to_string(),
        template_name: template_name.to_string(),
        source_path: source_path.map(|s| s.to_string()),
        action: action.clone(),
        schedule: schedule.clone(),
        status: TaskStatus::Active,
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    // Generate plist
    let plist = generate_plist(
        &label,
        app_binary_path,
        template_name,
        source_path,
        &action,
        &schedule,
        &id,
    );

    let plist_path = launch_agents_dir().join(format!("{}.plist", label));
    std::fs::write(&plist_path, plist)?;

    // Load with launchctl
    let status = std::process::Command::new("launchctl")
        .args(["load", &plist_path.to_string_lossy()])
        .status()
        .map_err(|e| AppError::Scheduler(format!("Failed to load launchd plist: {}", e)))?;

    if !status.success() {
        return Err(AppError::Scheduler(
            "Failed to register scheduled task with launchd".into(),
        ));
    }

    // Save to schedules.json
    let mut tasks = list_schedules().unwrap_or_default();
    tasks.push(task.clone());
    let json = serde_json::to_string_pretty(&tasks)?;
    std::fs::write(schedules_path(), json)?;

    Ok(task)
}

pub fn delete_schedule(id: &str) -> Result<(), AppError> {
    let label = format!("com.database-update.task.{}", id);
    let plist_path = launch_agents_dir().join(format!("{}.plist", label));

    // Unload
    let _ = std::process::Command::new("launchctl")
        .args(["unload", &plist_path.to_string_lossy()])
        .status();

    // Delete plist
    if plist_path.exists() {
        std::fs::remove_file(plist_path)?;
    }

    // Remove from schedules.json
    let mut tasks = list_schedules().unwrap_or_default();
    tasks.retain(|t| t.id != id);
    let json = serde_json::to_string_pretty(&tasks)?;
    std::fs::write(schedules_path(), json)?;

    Ok(())
}

/// Escape special XML characters to prevent injection in plist generation.
fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn generate_plist(
    label: &str,
    binary_path: &str,
    template_name: &str,
    source_path: Option<&str>,
    action: &ScheduleAction,
    schedule: &Schedule,
    task_id: &str,
) -> String {
    let action_str = match action {
        ScheduleAction::Condense => "condense",
        ScheduleAction::Run => "run",
        ScheduleAction::CondenseAndRun => "condense-and-run",
        ScheduleAction::FullPipeline => "full-pipeline",
    };

    let templates_dir = dirs::data_dir()
        .unwrap_or_default()
        .join("database-update/templates");
    let template_path = templates_dir.join(format!("{}.json", template_name.replace(['/', '\\', ' '], "_")));

    let mut args = format!(
        r#"        <string>{}</string>
        <string>--template</string>
        <string>{}</string>
        <string>--action</string>
        <string>{}</string>"#,
        xml_escape(binary_path),
        xml_escape(&template_path.display().to_string()),
        xml_escape(action_str),
    );

    if let Some(src) = source_path {
        args.push_str(&format!(
            r#"
        <string>--source</string>
        <string>{}</string>"#,
            xml_escape(src)
        ));
    }

    let calendar_interval = match schedule.schedule_type {
        ScheduleType::OneTime => {
            format!(
                r#"    <key>StartCalendarInterval</key>
    <dict>
        <key>Year</key><integer>{}</integer>
        <key>Month</key><integer>{}</integer>
        <key>Day</key><integer>{}</integer>
        <key>Hour</key><integer>{}</integer>
        <key>Minute</key><integer>{}</integer>
    </dict>"#,
                schedule.year.unwrap_or(2025),
                schedule.month.unwrap_or(1),
                schedule.day.unwrap_or(1),
                schedule.hour,
                schedule.minute,
            )
        }
        ScheduleType::Daily => {
            format!(
                r#"    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key><integer>{}</integer>
        <key>Minute</key><integer>{}</integer>
    </dict>"#,
                schedule.hour, schedule.minute,
            )
        }
        ScheduleType::Weekly => {
            format!(
                r#"    <key>StartCalendarInterval</key>
    <dict>
        <key>Weekday</key><integer>{}</integer>
        <key>Hour</key><integer>{}</integer>
        <key>Minute</key><integer>{}</integer>
    </dict>"#,
                schedule.day_of_week.unwrap_or(0),
                schedule.hour,
                schedule.minute,
            )
        }
    };

    let log_dir = logs_dir();

    let log_dir_escaped = xml_escape(&log_dir.display().to_string());
    let task_id_escaped = xml_escape(task_id);

    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{}</string>
    <key>ProgramArguments</key>
    <array>
{}
    </array>
{}
    <key>StandardOutPath</key>
    <string>{}/{}.log</string>
    <key>StandardErrorPath</key>
    <string>{}/{}.err</string>
</dict>
</plist>"#,
        xml_escape(label),
        args,
        calendar_interval,
        log_dir_escaped,
        task_id_escaped,
        log_dir_escaped,
        task_id_escaped,
    )
}
