export interface ProgressEvent {
  phase: "downloading" | "extracting" | "scanning" | "condensing" | "importing";
  bytes_processed: number;
  bytes_total: number;
  percent: number;
  speed_mbps: number;
  eta_seconds: number | null;
  message: string;
}

export interface TableInfo {
  name: string;
  columns: string[];
  foreign_keys: ForeignKeyInfo[];
  estimated_data_bytes: number;
  estimated_row_count: number;
}

export interface ForeignKeyInfo {
  column: string;
  references_table: string;
  references_column: string;
}

export interface ForeignKeyGraphData {
  dependencies: Record<string, string[]>;
  dependents: Record<string, string[]>;
}

export interface ScanResult {
  tables: TableInfo[];
  fk_graph: ForeignKeyGraphData;
}

export interface FkLockInfo {
  table: string;
  locked: boolean;
  locked_by: string[];
}

export interface CascadeEntry {
  table: string;
  chain: string[];
}

export type TableActionType = "include_all" | "exclude_data" | "include_last_n";

export interface TableConfig {
  action: TableActionType;
  n?: number;
}

export interface CondenseConfig {
  source_path: string;
  output_path: string;
  table_configs: Record<string, TableConfig>;
}

export interface DockerConfig {
  compose_file_path: string;
  service_name: string;
  database_name: string;
}

export interface PreflightStatus {
  docker_available: boolean;
  pv_available: boolean;
  compose_file_exists: boolean;
  container_running: boolean;
  errors: string[];
}

export interface Template {
  name: string;
  database_name: string;
  compose_file_path: string;
  service_name: string;
  output_directory: string;
  s3_uri: string | null;
  aws_profile: string | null;
  download_directory: string | null;
  table_configs: Record<string, TableConfig>;
  last_used: string | null;
}

export interface ScheduledTask {
  id: string;
  name: string;
  template_name: string;
  source_path: string | null;
  action: string;
  schedule: ScheduleConfig;
  status: string;
  created_at: string;
}

export interface ScheduleConfig {
  schedule_type: "one_time" | "daily" | "weekly";
  hour: number;
  minute: number;
  day_of_week?: number;
  year?: number;
  month?: number;
  day?: number;
}

export interface Preferences {
  download_directory: string;
  recent_files: string[];
  recent_s3_uris: string[];
}

export type AppScreen =
  | "home"
  | "s3download"
  | "scanning"
  | "configure"
  | "execute"
  | "templates"
  | "schedules";
