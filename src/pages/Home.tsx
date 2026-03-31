import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FolderOpen,
  Cloud,
  ChevronRight,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  Upload,
  KeyRound,
  FileKey,
} from "lucide-react";
import { ComboBox } from "../components/ComboBox";
import type { Preferences, Template } from "../types";

interface HomeProps {
  onLocalFile: (path: string) => void;
  onS3Download: (uri: string, profile: string | null) => void;
  onLoadTemplate: (template: Template) => void;
  onManageTemplates: () => void;
  onSchedules: () => void;
}

export function Home({
  onLocalFile,
  onS3Download,
  onLoadTemplate,
}: HomeProps) {
  const [sourceTab, setSourceTab] = useState<"local" | "s3">("local");
  const [s3Uri, setS3Uri] = useState("");
  const [authMethod, setAuthMethod] = useState<"profile" | "env">("profile");
  const [awsProfiles, setAwsProfiles] = useState<string[]>(["default"]);
  const [selectedProfile, setSelectedProfile] = useState("default");
  const [profileCredStatus, setProfileCredStatus] = useState<boolean | null>(null);
  const [hasEnvCreds, setHasEnvCreds] = useState<boolean | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    invoke<string[]>("list_aws_profiles").then(setAwsProfiles).catch(() => {});
    invoke<Preferences>("get_preferences").then(setPreferences).catch(() => {});
    invoke<Template[]>("list_templates").then(setTemplates).catch(() => {});
    invoke<boolean>("has_env_credentials").then((found) => {
      setHasEnvCreds(found);
      if (found) setAuthMethod("env");
    }).catch(() => setHasEnvCreds(false));
  }, []);

  useEffect(() => {
    setProfileCredStatus(null);
    invoke<boolean>("check_aws_credentials", { profile: selectedProfile })
      .then(setProfileCredStatus)
      .catch(() => setProfileCredStatus(false));
  }, [selectedProfile]);

  const credentialsValid = authMethod === "env" ? hasEnvCreds === true : profileCredStatus === true;

  const handleFileSelect = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const file = await open({
        filters: [{ name: "SQL Files", extensions: ["sql"] }],
        multiple: false,
      });
      if (file) {
        onLocalFile(file as string);
      }
    } catch (e) {
      console.error("File dialog error:", e);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* Page header */}
      <div style={{ padding: "40px 48px 20px 48px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }} className="text-text-primary">
          Import Source
        </h1>
        <p style={{ fontSize: 14, marginTop: 8 }} className="text-text-secondary">
          Select a MySQL dump file from your computer or download from S3
        </p>
      </div>

      <div style={{ padding: "0 48px" }} className="flex-1">
        {/* Source tabs card */}
        <div className="bg-bg-secondary rounded-xl border border-border-default overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-border-default" style={{ gap: 8, padding: "0 8px" }}>
            <button
              onClick={() => setSourceTab("local")}
              className={`flex items-center border-b-2 transition-colors ${
                sourceTab === "local"
                  ? "border-accent text-accent"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
              style={{ gap: 10, padding: "16px 20px", fontSize: 14, fontWeight: 500 }}
            >
              <FolderOpen size={17} />
              Local File
            </button>
            <button
              onClick={() => setSourceTab("s3")}
              className={`flex items-center border-b-2 transition-colors ${
                sourceTab === "s3"
                  ? "border-accent text-accent"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
              style={{ gap: 10, padding: "16px 20px", fontSize: 14, fontWeight: 500 }}
            >
              <Cloud size={17} />
              Download from S3
            </button>
          </div>

          {/* Tab content */}
          <div style={{ padding: 32 }}>
            {sourceTab === "local" ? (
              <div className="flex flex-col items-center" style={{ padding: "48px 0" }}>
                <div
                  className="rounded-2xl bg-accent/10 flex items-center justify-center"
                  style={{ width: 72, height: 72, marginBottom: 24 }}
                >
                  <Upload size={32} className="text-accent" />
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 500, marginBottom: 8 }} className="text-text-primary">
                  Select a SQL dump file
                </h3>
                <p style={{ fontSize: 14, marginBottom: 28 }} className="text-text-tertiary text-center max-w-sm">
                  Choose a <span className="mono">.sql</span> file from your filesystem to scan and configure
                </p>
                <button
                  onClick={handleFileSelect}
                  className="inline-flex items-center bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors shadow-sm"
                  style={{ gap: 10, padding: "12px 24px", fontSize: 14 }}
                >
                  <FolderOpen size={17} />
                  Browse Files...
                </button>

                {/* Recent files */}
                {preferences && preferences.recent_files.length > 0 && (
                  <div style={{ marginTop: 48, width: "100%", maxWidth: 520 }}>
                    <div style={{ fontSize: 11, marginBottom: 10 }} className="font-medium text-text-tertiary uppercase tracking-wider">
                      Recent Files
                    </div>
                    <div className="bg-bg-primary rounded-lg border border-border-subtle overflow-hidden">
                      {preferences.recent_files.slice(0, 5).map((f) => (
                        <button
                          key={f}
                          onClick={() => onLocalFile(f)}
                          className="w-full flex items-center hover:bg-bg-hover transition-colors text-left group border-b border-border-subtle last:border-b-0"
                          style={{ gap: 14, padding: "12px 18px" }}
                        >
                          <FileText size={15} className="text-text-tertiary flex-shrink-0" />
                          <span className="mono text-text-secondary group-hover:text-text-primary truncate flex-1" style={{ fontSize: 12 }}>
                            {f}
                          </span>
                          <ChevronRight size={15} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ maxWidth: 600 }}>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontSize: 13, marginBottom: 8, display: "block" }} className="font-medium text-text-secondary">
                    S3 URI
                  </label>
                  <ComboBox
                    value={s3Uri}
                    onChange={setS3Uri}
                    history={preferences?.recent_s3_uris ?? []}
                    placeholder="s3://bucket-name/path/to/dump.sql.gz"
                    mono
                  />
                </div>

                {/* Auth method selection */}
                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontSize: 13, marginBottom: 10, display: "block" }} className="font-medium text-text-secondary">
                    Authentication
                  </label>
                  <div className="flex" style={{ gap: 14 }}>
                    {/* AWS Profile card */}
                    <button
                      onClick={() => setAuthMethod("profile")}
                      className={`flex-1 flex items-start rounded-xl border transition-colors text-left ${
                        authMethod === "profile"
                          ? "border-accent bg-accent/5"
                          : "border-border-default bg-bg-tertiary hover:bg-bg-hover"
                      }`}
                      style={{ padding: "16px 18px", gap: 14 }}
                    >
                      <div
                        className={`rounded-lg flex items-center justify-center flex-shrink-0 ${
                          authMethod === "profile" ? "bg-accent/15" : "bg-bg-elevated"
                        }`}
                        style={{ width: 36, height: 36 }}
                      >
                        <KeyRound size={17} className={authMethod === "profile" ? "text-accent" : "text-text-tertiary"} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div style={{ fontSize: 13, fontWeight: 500 }} className={authMethod === "profile" ? "text-text-primary" : "text-text-secondary"}>
                          AWS Profile
                        </div>
                        <div style={{ fontSize: 12, marginTop: 2 }} className="text-text-tertiary">
                          Use credentials from ~/.aws
                        </div>
                      </div>
                      {authMethod === "profile" && (
                        <div className="flex items-center flex-shrink-0" style={{ marginTop: 2 }}>
                          {profileCredStatus === null ? (
                            <Loader2 size={15} className="text-text-tertiary animate-spin" />
                          ) : profileCredStatus ? (
                            <CheckCircle2 size={15} className="text-success" />
                          ) : (
                            <XCircle size={15} className="text-error" />
                          )}
                        </div>
                      )}
                    </button>

                    {/* .env File card */}
                    <button
                      onClick={() => setAuthMethod("env")}
                      className={`flex-1 flex items-start rounded-xl border transition-colors text-left ${
                        authMethod === "env"
                          ? "border-accent bg-accent/5"
                          : "border-border-default bg-bg-tertiary hover:bg-bg-hover"
                      }`}
                      style={{ padding: "16px 18px", gap: 14 }}
                    >
                      <div
                        className={`rounded-lg flex items-center justify-center flex-shrink-0 ${
                          authMethod === "env" ? "bg-accent/15" : "bg-bg-elevated"
                        }`}
                        style={{ width: 36, height: 36 }}
                      >
                        <FileKey size={17} className={authMethod === "env" ? "text-accent" : "text-text-tertiary"} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div style={{ fontSize: 13, fontWeight: 500 }} className={authMethod === "env" ? "text-text-primary" : "text-text-secondary"}>
                          Environment File
                        </div>
                        <div style={{ fontSize: 12, marginTop: 2 }} className="text-text-tertiary">
                          Use keys from local .env
                        </div>
                      </div>
                      {authMethod === "env" && (
                        <div className="flex items-center flex-shrink-0" style={{ marginTop: 2 }}>
                          {hasEnvCreds === null ? (
                            <Loader2 size={15} className="text-text-tertiary animate-spin" />
                          ) : hasEnvCreds ? (
                            <CheckCircle2 size={15} className="text-success" />
                          ) : (
                            <XCircle size={15} className="text-error" />
                          )}
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {/* Profile dropdown (only when AWS Profile is selected) */}
                {authMethod === "profile" && (
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ fontSize: 13, marginBottom: 8, display: "block" }} className="font-medium text-text-secondary">
                      Profile
                    </label>
                    <select
                      value={selectedProfile}
                      onChange={(e) => setSelectedProfile(e.target.value)}
                      style={{ maxWidth: 300 }}
                    >
                      {awsProfiles.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* .env path hint (only when .env is selected) */}
                {authMethod === "env" && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 12, padding: "10px 14px" }} className="text-text-tertiary bg-bg-tertiary rounded-lg border border-border-subtle">
                      <span className="mono">~/Library/Application Support/database-update/.env</span>
                      <span style={{ marginLeft: 8 }}>
                        {hasEnvCreds === null ? "" : hasEnvCreds ? "" : "— file not found or missing keys"}
                      </span>
                    </div>
                  </div>
                )}

                <button
                  onClick={async () => {
                    if (!s3Uri) return;
                    // Save S3 URI to history
                    if (preferences) {
                      const updated = [s3Uri, ...preferences.recent_s3_uris.filter((u) => u !== s3Uri)].slice(0, 10);
                      const newPrefs = { ...preferences, recent_s3_uris: updated };
                      setPreferences(newPrefs);
                      try { await invoke("save_preferences", { prefs: newPrefs }); } catch (e) { console.error(e); }
                    }
                    onS3Download(s3Uri, authMethod === "profile" ? selectedProfile : null);
                  }}
                  disabled={!s3Uri || !credentialsValid}
                  className="inline-flex items-center bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ gap: 10, padding: "12px 24px", fontSize: 14 }}
                >
                  <Cloud size={17} />
                  Download & Process
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Templates quick-load */}
        {templates.length > 0 && (
          <div style={{ marginTop: 36, marginBottom: 40 }}>
            <div style={{ fontSize: 11, marginBottom: 14 }} className="font-medium text-text-tertiary uppercase tracking-wider">
              Quick Load from Template
            </div>
            <div className="grid grid-cols-2" style={{ gap: 14 }}>
              {templates.slice(0, 4).map((t) => (
                <button
                  key={t.name}
                  onClick={() => onLoadTemplate(t)}
                  className="flex items-center bg-bg-secondary hover:bg-bg-hover border border-border-default rounded-xl text-left group transition-colors"
                  style={{ gap: 16, padding: "18px 20px" }}
                >
                  <div
                    className="rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0"
                    style={{ width: 44, height: 44 }}
                  >
                    <FileText size={18} className="text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 14, fontWeight: 500 }} className="text-text-primary truncate">
                      {t.name}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 3 }} className="text-text-tertiary truncate">
                      {t.database_name}
                      {t.s3_uri ? ` \u00b7 S3` : ""}
                      {` \u00b7 ${Object.keys(t.table_configs).length} tables`}
                    </div>
                  </div>
                  <ChevronRight
                    size={18}
                    className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
