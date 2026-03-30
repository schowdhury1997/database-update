import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Cloud, Archive, CheckCircle2, XCircle } from "lucide-react";
import { ProgressBar } from "../components/ProgressBar";
import { useProgress } from "../hooks/useProgress";
import type { Preferences } from "../types";

interface S3DownloadProps {
  s3Uri: string;
  awsProfile: string | null;
  onComplete: (sqlPath: string) => void;
  onCancel: () => void;
}

export function S3Download({ s3Uri, awsProfile, onComplete, onCancel }: S3DownloadProps) {
  const progress = useProgress();
  const [phase, setPhase] = useState<"downloading" | "extracting">("downloading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startDownload();
  }, []);

  const startDownload = async () => {
    try {
      const prefs = await invoke<Preferences>("get_preferences");
      setPhase("downloading");
      const gzPath = await invoke<string>("download_from_s3", {
        s3Uri,
        downloadDir: prefs.download_directory,
        profile: awsProfile ?? undefined,
      });
      if (gzPath.endsWith(".gz")) {
        setPhase("extracting");
        const sqlPath = await invoke<string>("extract_gz", { path: gzPath });
        onComplete(sqlPath);
      } else {
        onComplete(gzPath);
      }
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    }
  };

  const cur = progress;
  const isDownloading = phase === "downloading" && cur?.phase === "downloading";
  const isExtracting = phase === "extracting" && cur?.phase === "extracting";

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between" style={{ padding: "40px 48px 20px 48px" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600 }} className="text-text-primary">
            {phase === "downloading" ? "Downloading from S3" : "Extracting Archive"}
          </h1>
          <p className="mono text-text-tertiary" style={{ fontSize: 12, marginTop: 8 }}>{s3Uri}</p>
        </div>
        <button
          onClick={onCancel}
          className="bg-bg-tertiary hover:bg-bg-hover rounded-lg text-text-secondary transition-colors"
          style={{ padding: "10px 20px", fontSize: 14 }}
        >
          Cancel
        </button>
      </div>

      <div style={{ padding: "0 48px" }} className="flex-1">
        {error ? (
          <div className="flex items-start bg-error-muted border border-error/20 rounded-xl" style={{ gap: 14, padding: 24 }}>
            <XCircle size={20} className="text-error flex-shrink-0 mt-0.5" />
            <div style={{ fontSize: 14 }} className="text-error">{error}</div>
          </div>
        ) : (
          <div className="bg-bg-secondary rounded-xl border border-border-default" style={{ padding: 32 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
              <StepRow icon={<Cloud size={20} />} label="Download"
                status={phase === "extracting" ? "complete" : isDownloading ? "active" : "pending"}>
                {isDownloading && cur && (
                  <div style={{ marginTop: 16 }}>
                    <ProgressBar percent={cur.percent} />
                    <div className="flex justify-between text-text-tertiary" style={{ fontSize: 12, marginTop: 8 }}>
                      <span>{cur.speed_mbps.toFixed(1)} MB/s</span>
                      <span>{cur.message}</span>
                      {cur.eta_seconds != null && <span>ETA: {formatEta(cur.eta_seconds)}</span>}
                    </div>
                  </div>
                )}
              </StepRow>
              <StepRow icon={<Archive size={20} />} label="Extract"
                status={isExtracting ? "active" : "pending"}>
                {isExtracting && cur && (
                  <div style={{ marginTop: 16 }}>
                    <ProgressBar percent={cur.percent} />
                    <div className="flex justify-between text-text-tertiary" style={{ fontSize: 12, marginTop: 8 }}>
                      <span>{cur.speed_mbps.toFixed(1)} MB/s</span>
                      <span>{cur.message}</span>
                      {cur.eta_seconds != null && <span>ETA: {formatEta(cur.eta_seconds)}</span>}
                    </div>
                  </div>
                )}
              </StepRow>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepRow({ icon, label, status, children }: {
  icon: React.ReactNode; label: string;
  status: "pending" | "active" | "complete"; children?: React.ReactNode;
}) {
  return (
    <div className="flex" style={{ gap: 20 }}>
      <div
        className={`rounded-xl flex items-center justify-center flex-shrink-0 ${
          status === "complete" ? "bg-success/15 text-success"
            : status === "active" ? "bg-accent/15 text-accent"
            : "bg-bg-tertiary text-text-tertiary"
        }`}
        style={{ width: 44, height: 44 }}
      >
        {status === "complete" ? <CheckCircle2 size={20} /> : icon}
      </div>
      <div className="flex-1 min-w-0" style={{ paddingTop: 4 }}>
        <div className="flex items-center" style={{ gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}
            className={status === "complete" ? "text-success" : status === "active" ? "text-text-primary" : "text-text-tertiary"}>
            {label}
          </span>
          {status === "active" && <div className="bg-accent animate-pulse" style={{ width: 7, height: 7, borderRadius: "50%" }} />}
          {status === "complete" && <span style={{ fontSize: 12 }} className="text-success">Complete</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
