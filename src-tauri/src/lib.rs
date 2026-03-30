pub mod cli;
pub mod commands;
pub mod condenser;
pub mod docker;
pub mod error;
pub mod extractor;
pub mod fk_graph;
pub mod parser;
pub mod progress;
pub mod s3;
pub mod scanner;
pub mod scheduler;
pub mod templates;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::scan_file,
            commands::compute_fk_locks,
            commands::compute_cascade_uncheck,
            commands::condense,
            commands::run_sql,
            commands::preflight_check,
            commands::download_from_s3,
            commands::extract_gz,
            commands::check_aws_credentials,
            commands::has_env_credentials,
            commands::list_aws_profiles,
            commands::list_templates,
            commands::save_template,
            commands::load_template,
            commands::delete_template,
            commands::import_template,
            commands::export_template,
            commands::list_schedules,
            commands::create_schedule,
            commands::delete_schedule,
            commands::get_preferences,
            commands::save_preferences,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
