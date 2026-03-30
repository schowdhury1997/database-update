import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, XCircle, Loader2 } from "lucide-react";
import { ProgressBar } from "../components/ProgressBar";
import { useProgress } from "../hooks/useProgress";
import type { ScanResult } from "../types";

interface ScanningProps {
  filePath: string;
  onComplete: (result: ScanResult) => void;
  onCancel: () => void;
}

export function Scanning({ filePath, onComplete, onCancel }: ScanningProps) {
  const progress = useProgress();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<ScanResult>("scan_file", { path: filePath })
      .then(onComplete)
      .catch((e) => setError(typeof e === "string" ? e : String(e)));
  }, [filePath]);

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between" style={{ padding: "40px 48px 20px 48px" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600 }} className="text-text-primary">
            Scanning SQL File
          </h1>
          <p className="mono text-text-tertiary" style={{ fontSize: 12, marginTop: 8 }}>
            {filePath.split("/").pop()}
          </p>
        </div>
        <button
          onClick={onCancel}
          className="bg-bg-tertiary hover:bg-bg-hover rounded-lg text-text-secondary transition-colors"
          style={{ padding: "10px 20px", fontSize: 14 }}
        >
          Cancel
        </button>
      </div>

      <div style={{ padding: "0 48px" }} className="flex-1 flex items-start">
        {error ? (
          <div className="w-full flex items-start bg-error-muted border border-error/20 rounded-xl" style={{ gap: 14, padding: 24 }}>
            <XCircle size={20} className="text-error flex-shrink-0 mt-0.5" />
            <div style={{ fontSize: 14 }} className="text-error">{error}</div>
          </div>
        ) : (
          <div className="w-full bg-bg-secondary rounded-xl border border-border-default" style={{ padding: "48px 40px" }}>
            <div className="flex flex-col items-center">
              <div className="rounded-2xl bg-accent/10 flex items-center justify-center" style={{ width: 64, height: 64, marginBottom: 24 }}>
                {progress ? <Search size={28} className="text-accent" /> : <Loader2 size={28} className="text-accent animate-spin" />}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 500 }} className="text-text-primary">
                {progress?.message ?? "Starting scan..."}
              </h3>
              {progress && progress.phase === "scanning" && (
                <div style={{ width: "100%", maxWidth: 420, marginTop: 32 }}>
                  <ProgressBar percent={progress.percent} />
                  <div className="flex justify-between text-text-tertiary" style={{ fontSize: 12, marginTop: 10 }}>
                    <span>{progress.speed_mbps.toFixed(0)} MB/s</span>
                    {progress.eta_seconds != null && (
                      <span>ETA: {progress.eta_seconds < 60 ? `${progress.eta_seconds}s` : `${Math.floor(progress.eta_seconds / 60)}m`}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
