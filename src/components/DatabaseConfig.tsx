import { Container, Server, Database, UserCog, Trash2 } from "lucide-react";
import { ComboBox } from "./ComboBox";
import type { DockerConfig } from "../types";

interface DatabaseConfigProps {
  config: DockerConfig;
  onChange: (config: DockerConfig) => void;
  recentDatabaseNames?: string[];
}

export function DatabaseConfig({ config, onChange, recentDatabaseNames = [] }: DatabaseConfigProps) {
  const definerEnabled = !!config.definer_override;

  const toggleDefiner = () => {
    if (definerEnabled) {
      onChange({ ...config, definer_override: null });
    } else {
      onChange({ ...config, definer_override: { user: "root", host: "localhost" } });
    }
  };

  return (
    <div>
      <div className="flex items-center" style={{ gap: 10, marginBottom: 16 }}>
        <Container size={16} className="text-accent" />
        <h3 style={{ fontSize: 14, fontWeight: 600 }} className="text-text-primary">Docker Import Settings</h3>
      </div>
      <div className="grid grid-cols-3" style={{ gap: 20 }}>
        <div>
          <label className="flex items-center text-text-secondary" style={{ gap: 6, fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
            <Database size={12} />
            Database name
          </label>
          <ComboBox
            value={config.database_name}
            onChange={(v) => onChange({ ...config, database_name: v })}
            history={recentDatabaseNames}
            placeholder="e.g., my_database"
            mono
          />
        </div>
        <div>
          <label className="flex items-center text-text-secondary" style={{ gap: 6, fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
            <FolderIcon />
            Compose file path
          </label>
          <input type="text" value={config.compose_file_path}
            onChange={(e) => onChange({ ...config, compose_file_path: e.target.value })}
            placeholder="/path/to/docker-compose.yml" className="w-full" />
        </div>
        <div>
          <label className="flex items-center text-text-secondary" style={{ gap: 6, fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
            <Server size={12} />
            Service name
          </label>
          <input type="text" value={config.service_name}
            onChange={(e) => onChange({ ...config, service_name: e.target.value })}
            placeholder="mysql" className="w-full" />
        </div>
      </div>

      {/* Import Options */}
      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <label className="flex items-center cursor-pointer" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={config.drop_existing_data ?? false}
            onChange={(e) => onChange({ ...config, drop_existing_data: e.target.checked })}
            className="accent-accent"
            style={{ width: 14, height: 14 }}
          />
          <span className="flex items-center text-text-secondary" style={{ gap: 6, fontSize: 12, fontWeight: 500 }}>
            <Trash2 size={12} />
            Drop existing tables before import
          </span>
          <span className="text-text-tertiary" style={{ fontSize: 11 }}>
            Removes all existing tables and views from the database first
          </span>
        </label>
      </div>

      {/* Definer Override */}
      <div style={{ marginTop: 12 }}>
        <label className="flex items-center cursor-pointer" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={definerEnabled}
            onChange={toggleDefiner}
            className="accent-accent"
            style={{ width: 14, height: 14 }}
          />
          <span className="flex items-center text-text-secondary" style={{ gap: 6, fontSize: 12, fontWeight: 500 }}>
            <UserCog size={12} />
            Override SQL DEFINER
          </span>
          <span className="text-text-tertiary" style={{ fontSize: 11 }}>
            Replace DEFINER user/host in views, triggers, and procedures
          </span>
        </label>
        {definerEnabled && config.definer_override && (
          <div className="grid grid-cols-2" style={{ gap: 20, marginTop: 12, maxWidth: 440 }}>
            <div>
              <label className="text-text-secondary" style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, display: "block" }}>
                User
              </label>
              <input type="text" value={config.definer_override.user}
                onChange={(e) => onChange({ ...config, definer_override: { ...config.definer_override!, user: e.target.value } })}
                placeholder="root" className="w-full" />
            </div>
            <div>
              <label className="text-text-secondary" style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, display: "block" }}>
                Host
              </label>
              <input type="text" value={config.definer_override.host}
                onChange={(e) => onChange({ ...config, definer_override: { ...config.definer_override!, host: e.target.value } })}
                placeholder="localhost" className="w-full" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
