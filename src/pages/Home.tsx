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
} from "lucide-react";
import type { Preferences, Template } from "../types";

interface HomeProps {
  onLocalFile: (path: string) => void;
  onS3Download: (uri: string, profile: string) => void;
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
  const [awsProfiles, setAwsProfiles] = useState<string[]>(["default"]);
  const [selectedProfile, setSelectedProfile] = useState("default");
  const [credentialStatus, setCredentialStatus] = useState<boolean | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    invoke<string[]>("list_aws_profiles").then(setAwsProfiles).catch(() => {});
    invoke<Preferences>("get_preferences").then(setPreferences).catch(() => {});
    invoke<Template[]>("list_templates").then(setTemplates).catch(() => {});
  }, []);

  useEffect(() => {
    setCredentialStatus(null);
    invoke<boolean>("check_aws_credentials", { profile: selectedProfile })
      .then(setCredentialStatus)
      .catch(() => setCredentialStatus(false));
  }, [selectedProfile]);

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
                  <input
                    type="text"
                    value={s3Uri}
                    onChange={(e) => setS3Uri(e.target.value)}
                    placeholder="s3://bucket-name/path/to/dump.sql.gz"
                    className="w-full mono"
                  />
                </div>
                <div className="flex items-end" style={{ gap: 20, marginBottom: 28 }}>
                  <div className="flex-1">
                    <label style={{ fontSize: 13, marginBottom: 8, display: "block" }} className="font-medium text-text-secondary">
                      AWS Profile
                    </label>
                    <select
                      value={selectedProfile}
                      onChange={(e) => setSelectedProfile(e.target.value)}
                      className="w-full"
                    >
                      {awsProfiles.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center" style={{ gap: 10, paddingBottom: 12 }}>
                    {credentialStatus === null ? (
                      <Loader2 size={16} className="text-text-tertiary animate-spin" />
                    ) : credentialStatus ? (
                      <CheckCircle2 size={16} className="text-success" />
                    ) : (
                      <XCircle size={16} className="text-error" />
                    )}
                    <span style={{ fontSize: 13 }} className="text-text-secondary">
                      {credentialStatus === null
                        ? "Checking..."
                        : credentialStatus
                        ? "Valid credentials"
                        : "No credentials found"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => s3Uri && onS3Download(s3Uri, selectedProfile)}
                  disabled={!s3Uri || credentialStatus !== true}
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
