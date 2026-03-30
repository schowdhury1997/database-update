import { Container, Server, Database } from "lucide-react";
import type { DockerConfig } from "../types";

interface DatabaseConfigProps {
  config: DockerConfig;
  onChange: (config: DockerConfig) => void;
}

export function DatabaseConfig({ config, onChange }: DatabaseConfigProps) {
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
          <input type="text" value={config.database_name}
            onChange={(e) => onChange({ ...config, database_name: e.target.value })}
            placeholder="e.g., my_database" className="w-full" />
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
