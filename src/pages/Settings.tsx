import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FolderOpen,
  Server,
  Database,
  Cloud,
  X,
  HardDrive,
} from "lucide-react";
import type { Preferences } from "../types";

interface SettingsProps {
  onBack: () => void;
}

export function Settings({ onBack: _onBack }: SettingsProps) {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    invoke<Preferences>("get_preferences").then(setPreferences).catch(console.error);
  }, []);

  const save = async (updated: Preferences) => {
    setPreferences(updated);
    setSaving(true);
    setSaved(false);
    try {
      await invoke("save_preferences", { prefs: updated });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof Preferences, value: string) => {
    if (!preferences) return;
    save({ ...preferences, [field]: value });
  };

  const removeHistoryEntry = (field: "recent_s3_uris" | "recent_database_names", index: number) => {
    if (!preferences) return;
    const updated = [...preferences[field]];
    updated.splice(index, 1);
    save({ ...preferences, [field]: updated });
  };

  const handleBrowseDirectory = async (field: "download_directory" | "default_output_directory" | "default_compose_file_path") => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      if (field === "default_compose_file_path") {
        const file = await open({
          filters: [{ name: "YAML Files", extensions: ["yml", "yaml"] }],
          multiple: false,
        });
        if (file) updateField(field, file as string);
      } else {
        const dir = await open({ directory: true, multiple: false });
        if (dir) updateField(field, dir as string);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!preferences) {
    return (
      <div className="h-full flex items-center justify-center text-text-tertiary">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between" style={{ padding: "40px 48px 20px 48px" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }} className="text-text-primary">
            Settings
          </h1>
          <p style={{ fontSize: 14, marginTop: 8 }} className="text-text-secondary">
            Configure default values and manage history
          </p>
        </div>
        <div className="flex items-center" style={{ gap: 8 }}>
          {saved && (
            <span className="text-success" style={{ fontSize: 13 }}>Saved</span>
          )}
          {saving && (
            <span className="text-text-tertiary" style={{ fontSize: 13 }}>Saving...</span>
          )}
        </div>
      </div>

      <div style={{ padding: "0 48px 48px 48px" }} className="flex flex-col" >
        {/* Directories Section */}
        <div className="bg-bg-secondary rounded-xl border border-border-default" style={{ padding: 32, marginBottom: 24 }}>
          <div className="flex items-center" style={{ gap: 10, marginBottom: 24 }}>
            <FolderOpen size={18} className="text-accent" />
            <h2 style={{ fontSize: 16, fontWeight: 600 }} className="text-text-primary">Directories</h2>
          </div>

          <div className="flex flex-col" style={{ gap: 20 }}>
            <SettingsField
              label="Download directory"
              description="Where S3 downloads are saved"
              icon={<Cloud size={13} />}
            >
              <div className="flex items-center" style={{ gap: 10 }}>
                <input
                  type="text"
                  value={preferences.download_directory}
                  onChange={(e) => updateField("download_directory", e.target.value)}
                  placeholder="~/Downloads/database-update"
                  className="flex-1 mono"
                  style={{ fontSize: 12 }}
                />
                <button
                  onClick={() => handleBrowseDirectory("download_directory")}
                  className="flex items-center rounded-lg text-text-secondary bg-bg-tertiary hover:bg-bg-hover border border-border-default transition-colors flex-shrink-0"
                  style={{ padding: "8px 14px", fontSize: 12 }}
                >
                  Browse
                </button>
              </div>
            </SettingsField>

            <SettingsField
              label="Default output directory"
              description="Where condensed SQL files are saved"
              icon={<HardDrive size={13} />}
            >
              <div className="flex items-center" style={{ gap: 10 }}>
                <input
                  type="text"
                  value={preferences.default_output_directory}
                  onChange={(e) => updateField("default_output_directory", e.target.value)}
                  placeholder="Same directory as source file"
                  className="flex-1 mono"
                  style={{ fontSize: 12 }}
                />
                <button
                  onClick={() => handleBrowseDirectory("default_output_directory")}
                  className="flex items-center rounded-lg text-text-secondary bg-bg-tertiary hover:bg-bg-hover border border-border-default transition-colors flex-shrink-0"
                  style={{ padding: "8px 14px", fontSize: 12 }}
                >
                  Browse
                </button>
              </div>
            </SettingsField>
          </div>
        </div>

        {/* Docker Defaults Section */}
        <div className="bg-bg-secondary rounded-xl border border-border-default" style={{ padding: 32, marginBottom: 24 }}>
          <div className="flex items-center" style={{ gap: 10, marginBottom: 24 }}>
            <Server size={18} className="text-accent" />
            <h2 style={{ fontSize: 16, fontWeight: 600 }} className="text-text-primary">Docker Defaults</h2>
          </div>

          <div className="flex flex-col" style={{ gap: 20 }}>
            <SettingsField
              label="Compose file path"
              description="Default path to docker-compose.yml"
              icon={<FolderIcon />}
            >
              <div className="flex items-center" style={{ gap: 10 }}>
                <input
                  type="text"
                  value={preferences.default_compose_file_path}
                  onChange={(e) => updateField("default_compose_file_path", e.target.value)}
                  placeholder="/path/to/docker-compose.yml"
                  className="flex-1 mono"
                  style={{ fontSize: 12 }}
                />
                <button
                  onClick={() => handleBrowseDirectory("default_compose_file_path")}
                  className="flex items-center rounded-lg text-text-secondary bg-bg-tertiary hover:bg-bg-hover border border-border-default transition-colors flex-shrink-0"
                  style={{ padding: "8px 14px", fontSize: 12 }}
                >
                  Browse
                </button>
              </div>
            </SettingsField>

            <SettingsField
              label="Service name"
              description="Default Docker service name for MySQL"
              icon={<Server size={13} />}
            >
              <input
                type="text"
                value={preferences.default_service_name}
                onChange={(e) => updateField("default_service_name", e.target.value)}
                placeholder="mysql"
                style={{ maxWidth: 300, fontSize: 12 }}
                className="mono"
              />
            </SettingsField>
          </div>
        </div>

        {/* History Section */}
        <div className="bg-bg-secondary rounded-xl border border-border-default" style={{ padding: 32 }}>
          <div className="flex items-center" style={{ gap: 10, marginBottom: 24 }}>
            <Database size={18} className="text-accent" />
            <h2 style={{ fontSize: 16, fontWeight: 600 }} className="text-text-primary">History</h2>
          </div>

          <div className="flex flex-col" style={{ gap: 28 }}>
            {/* Database name history */}
            <div>
              <div className="flex items-center" style={{ gap: 6, marginBottom: 12 }}>
                <Database size={13} className="text-text-tertiary" />
                <span style={{ fontSize: 13, fontWeight: 500 }} className="text-text-secondary">
                  Database names
                </span>
                <span style={{ fontSize: 12 }} className="text-text-tertiary">
                  ({preferences.recent_database_names.length}/10)
                </span>
              </div>
              {preferences.recent_database_names.length === 0 ? (
                <div className="text-text-tertiary bg-bg-tertiary rounded-lg border border-border-subtle"
                  style={{ padding: "16px 18px", fontSize: 13 }}>
                  No database names saved yet. Names will appear here as you use them.
                </div>
              ) : (
                <div className="bg-bg-primary rounded-lg border border-border-subtle overflow-hidden">
                  {preferences.recent_database_names.map((name, i) => (
                    <div
                      key={`${name}-${i}`}
                      className="flex items-center justify-between border-b border-border-subtle last:border-b-0 group hover:bg-bg-hover transition-colors"
                      style={{ padding: "10px 18px" }}
                    >
                      <span className="mono text-text-secondary" style={{ fontSize: 12 }}>{name}</span>
                      <button
                        onClick={() => removeHistoryEntry("recent_database_names", i)}
                        className="text-text-tertiary hover:text-error transition-colors opacity-0 group-hover:opacity-100"
                        title="Remove"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* S3 URI history */}
            <div>
              <div className="flex items-center" style={{ gap: 6, marginBottom: 12 }}>
                <Cloud size={13} className="text-text-tertiary" />
                <span style={{ fontSize: 13, fontWeight: 500 }} className="text-text-secondary">
                  S3 URIs
                </span>
                <span style={{ fontSize: 12 }} className="text-text-tertiary">
                  ({preferences.recent_s3_uris.length}/10)
                </span>
              </div>
              {preferences.recent_s3_uris.length === 0 ? (
                <div className="text-text-tertiary bg-bg-tertiary rounded-lg border border-border-subtle"
                  style={{ padding: "16px 18px", fontSize: 13 }}>
                  No S3 URIs saved yet. URIs will appear here as you use them.
                </div>
              ) : (
                <div className="bg-bg-primary rounded-lg border border-border-subtle overflow-hidden">
                  {preferences.recent_s3_uris.map((uri, i) => (
                    <div
                      key={`${uri}-${i}`}
                      className="flex items-center justify-between border-b border-border-subtle last:border-b-0 group hover:bg-bg-hover transition-colors"
                      style={{ padding: "10px 18px" }}
                    >
                      <span className="mono text-text-secondary truncate" style={{ fontSize: 12 }}>{uri}</span>
                      <button
                        onClick={() => removeHistoryEntry("recent_s3_uris", i)}
                        className="text-text-tertiary hover:text-error transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                        title="Remove"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsField({ label, description, icon, children }: {
  label: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center" style={{ gap: 6, marginBottom: 8 }}>
        <span className="text-text-tertiary">{icon}</span>
        <label style={{ fontSize: 13, fontWeight: 500 }} className="text-text-secondary">
          {label}
        </label>
      </div>
      <div style={{ fontSize: 12, marginBottom: 10 }} className="text-text-tertiary">
        {description}
      </div>
      {children}
    </div>
  );
}

function FolderIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
