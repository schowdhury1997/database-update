import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CheckCircle2, XCircle, Zap, Play, ShieldCheck, ArrowLeft, Terminal,
} from "lucide-react";
import { ProgressBar } from "../components/ProgressBar";
import { useProgress } from "../hooks/useProgress";
import type { CondenseConfig, DockerConfig } from "../types";

type ExecuteMode = "condense" | "run" | "condense_and_run";

interface ExecuteProps {
  mode: ExecuteMode;
  condenseConfig?: CondenseConfig;
  dockerConfig?: DockerConfig;
  sqlPath?: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function Execute({ mode, condenseConfig, dockerConfig, sqlPath, onComplete, onCancel }: ExecuteProps) {
  const progress = useProgress();
  const [phase, setPhase] = useState("starting");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const addLog = (msg: string) => setLog((p) => [...p, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const hasStarted = useRef(false);
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const run = async () => {
      try {
        if (mode === "condense" || mode === "condense_and_run") {
          if (!condenseConfig) throw new Error("Missing condense config");
          if (mode === "condense_and_run" && dockerConfig) {
            setPhase("preflight"); addLog("Running pre-flight checks...");
            const s = await invoke<{ errors: string[] }>("preflight_check", { dockerConfig });
            if (s.errors.length > 0) throw new Error(s.errors.join("\n"));
            addLog("Pre-flight checks passed.");
          }
          setPhase("condensing"); addLog("Starting condensing...");
          const out = await invoke<string>("condense", { config: condenseConfig });
          setResultPath(out); addLog(`Condensed file: ${out}`);
          if (mode === "condense_and_run" && dockerConfig) {
            setPhase("importing"); addLog("Starting MySQL import...");
            const warnings1 = await invoke<string[]>("run_sql", { dockerConfig, sqlPath: out });
            if (warnings1.length > 0) { addLog(`MySQL warnings:\n${warnings1.join("\n")}`); }
            addLog("Import complete!");
          }
        } else {
          if (!dockerConfig || !sqlPath) throw new Error("Missing config");
          setPhase("preflight"); addLog("Running pre-flight checks...");
          const s = await invoke<{ errors: string[] }>("preflight_check", { dockerConfig });
          if (s.errors.length > 0) throw new Error(s.errors.join("\n"));
          addLog("Pre-flight checks passed.");
          setPhase("importing"); addLog("Starting MySQL import...");
          const warnings2 = await invoke<string[]>("run_sql", { dockerConfig, sqlPath });
          if (warnings2.length > 0) { addLog(`MySQL warnings:\n${warnings2.join("\n")}`); }
          addLog("Import complete!");
        }
        setDone(true); setPhase("complete"); addLog("All operations completed successfully.");
      } catch (e) {
        const msg = typeof e === "string" ? e : (e as Error).message ?? String(e);
        setError(msg); addLog(`ERROR: ${msg}`);
      }
    };

    run();
  }, [mode, condenseConfig, dockerConfig, sqlPath]);

  const phases = mode === "condense" ? ["condensing"] : mode === "run" ? ["preflight", "importing"] : ["preflight", "condensing", "importing"];
  const order = ["starting", "preflight", "condensing", "importing", "complete"];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0" style={{ padding: "40px 48px 20px 48px" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600 }} className="text-text-primary">
              {done ? "Execution Complete" : "Running Pipeline"}
            </h1>
            <p style={{ fontSize: 14, marginTop: 8 }} className="text-text-secondary">
              {mode === "condense" ? "Condensing SQL file" : mode === "run" ? "Importing SQL to Docker MySQL" : "Condensing then importing to Docker MySQL"}
            </p>
          </div>
          {!done && !error && (
            <button onClick={onCancel} className="bg-bg-tertiary hover:bg-bg-hover rounded-lg text-text-secondary transition-colors"
              style={{ padding: "10px 20px", fontSize: 14 }}>Cancel</button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: "0 48px 48px 48px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {/* Steps */}
          <div className="bg-bg-secondary rounded-xl border border-border-default" style={{ padding: 32 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
              {phases.map((p) => {
                const sIdx = order.indexOf(p), cIdx = order.indexOf(phase);
                const st = done ? "complete" : error && p === phase ? "error" : p === phase ? "active" : sIdx < cIdx ? "complete" : "pending";
                return (
                  <div key={p} className="flex" style={{ gap: 20 }}>
                    <div className={`rounded-xl flex items-center justify-center flex-shrink-0 ${
                      st === "complete" ? "bg-success/15 text-success" : st === "active" ? "bg-accent/15 text-accent" : st === "error" ? "bg-error/15 text-error" : "bg-bg-tertiary text-text-tertiary"
                    }`} style={{ width: 44, height: 44 }}>
                      {st === "complete" ? <CheckCircle2 size={20} /> : st === "error" ? <XCircle size={20} /> : p === "preflight" ? <ShieldCheck size={20} /> : p === "condensing" ? <Zap size={20} /> : <Play size={20} />}
                    </div>
                    <div className="flex-1 min-w-0" style={{ paddingTop: 4 }}>
                      <div className="flex items-center" style={{ gap: 10 }}>
                        <span style={{ fontSize: 15, fontWeight: 500 }}
                          className={st === "complete" ? "text-success" : st === "active" ? "text-text-primary" : st === "error" ? "text-error" : "text-text-tertiary"}>
                          {p === "preflight" ? "Pre-flight Checks" : p === "condensing" ? "Condensing SQL" : "Importing to MySQL"}
                        </span>
                        {st === "active" && <div className="bg-accent animate-pulse" style={{ width: 7, height: 7, borderRadius: "50%" }} />}
                      </div>
                      {st === "active" && progress && !done && (
                        <div style={{ marginTop: 16 }}>
                          <ProgressBar percent={progress.percent} />
                          <div className="flex justify-between text-text-tertiary" style={{ fontSize: 12, marginTop: 8 }}>
                            <span>{progress.speed_mbps.toFixed(1)} MB/s</span>
                            <span>{progress.message}</span>
                            {progress.eta_seconds != null && <span>ETA: {progress.eta_seconds < 60 ? `${progress.eta_seconds}s` : `${Math.floor(progress.eta_seconds / 60)}m`}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="flex items-start bg-error-muted border border-error/20 rounded-xl" style={{ gap: 14, padding: 24 }}>
              <XCircle size={20} className="text-error flex-shrink-0 mt-0.5" />
              <div style={{ fontSize: 14 }} className="text-error whitespace-pre-wrap">{error}</div>
            </div>
          )}

          {done && (
            <div className="flex items-start bg-success-muted border border-success/20 rounded-xl" style={{ gap: 14, padding: 24 }}>
              <CheckCircle2 size={20} className="text-success flex-shrink-0 mt-0.5" />
              <div style={{ fontSize: 14 }} className="text-success">
                {resultPath && <div>Condensed file: <span className="mono">{resultPath}</span></div>}
                {mode !== "condense" && <div>Database import successful.</div>}
              </div>
            </div>
          )}

          {/* Log */}
          <div>
            <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
              <Terminal size={14} className="text-text-tertiary" />
              <span className="font-medium text-text-tertiary uppercase tracking-wider" style={{ fontSize: 11 }}>Output Log</span>
            </div>
            <div className="bg-bg-primary rounded-xl border border-border-default mono overflow-y-auto"
              style={{ padding: 20, maxHeight: 200, fontSize: 11 }}>
              {log.map((line, i) => (
                <div key={i} className={line.includes("ERROR") ? "text-error" : "text-text-secondary"} style={{ padding: "3px 0" }}>{line}</div>
              ))}
            </div>
          </div>

          {(done || error) && (
            <button onClick={onComplete}
              className="flex items-center rounded-lg text-white bg-accent hover:bg-accent-hover font-medium transition-colors shadow-sm self-start"
              style={{ gap: 10, padding: "12px 24px", fontSize: 14 }}>
              <ArrowLeft size={16} /> Back to Home
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
