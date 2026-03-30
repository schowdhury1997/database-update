import { X, AlertTriangle, ChevronRight } from "lucide-react";
import { Tooltip } from "./Tooltip";
import type { CascadeEntry } from "../types";

interface CascadeUncheckModalProps {
  targetTable: string;
  cascadeEntries: CascadeEntry[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function CascadeUncheckModal({
  targetTable,
  cascadeEntries,
  onConfirm,
  onCancel,
}: CascadeUncheckModalProps) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 9000, backgroundColor: "rgba(0, 0, 0, 0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="bg-bg-secondary border border-border-default rounded-xl shadow-2xl flex flex-col"
        style={{ width: 480, maxHeight: "70vh" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between flex-shrink-0 border-b border-border-default"
          style={{ padding: "20px 24px" }}
        >
          <div className="flex items-center" style={{ gap: 12 }}>
            <div
              className="flex items-center justify-center rounded-lg bg-warning-muted"
              style={{ width: 36, height: 36 }}
            >
              <AlertTriangle size={18} className="text-warning" />
            </div>
            <div>
              <h2 className="text-text-primary font-semibold" style={{ fontSize: 15 }}>
                Cascade Uncheck
              </h2>
              <p className="text-text-tertiary" style={{ fontSize: 12 }}>
                Foreign key dependencies will be affected
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-text-tertiary hover:text-text-primary transition-colors rounded-lg hover:bg-bg-hover"
            style={{ padding: 6 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "20px 24px" }}>
          <p className="text-text-secondary" style={{ fontSize: 13, marginBottom: 16 }}>
            Removing <span className="mono text-text-primary font-medium">{targetTable}</span> will
            also exclude the following {cascadeEntries.length === 1 ? "table" : `${cascadeEntries.length} tables`} that
            depend on it via foreign keys:
          </p>

          <div className="flex flex-col" style={{ gap: 6 }}>
            {cascadeEntries.map((entry) => (
              <Tooltip
                key={entry.table}
                position="right"
                maxWidth={360}
                content={
                  <div>
                    <p className="text-text-tertiary font-medium" style={{ fontSize: 11, marginBottom: 6 }}>
                      FK dependency chain
                    </p>
                    <div className="flex items-center flex-wrap" style={{ gap: 4 }}>
                      {entry.chain.map((step, i) => (
                        <span key={step} className="flex items-center" style={{ gap: 4 }}>
                          <span
                            className={`mono ${step === targetTable ? "text-warning" : "text-text-primary"}`}
                            style={{ fontSize: 12 }}
                          >
                            {step}
                          </span>
                          {i < entry.chain.length - 1 && (
                            <ChevronRight size={11} className="text-text-tertiary" />
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                }
              >
                <div
                  className="flex items-center w-full bg-bg-tertiary rounded-lg border border-border-subtle hover:border-border-default transition-colors cursor-help"
                  style={{ padding: "10px 14px", gap: 10 }}
                >
                  <span className="mono text-text-primary" style={{ fontSize: 12 }}>
                    {entry.table}
                  </span>
                  <span className="text-text-tertiary" style={{ fontSize: 11, marginLeft: "auto" }}>
                    {entry.chain.length - 1} {entry.chain.length - 1 === 1 ? "hop" : "hops"} away
                  </span>
                </div>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end flex-shrink-0 border-t border-border-default"
          style={{ padding: "16px 24px", gap: 10 }}
        >
          <button
            onClick={onCancel}
            className="rounded-lg text-text-secondary bg-bg-tertiary hover:bg-bg-hover border border-border-default transition-colors font-medium"
            style={{ padding: "10px 20px", fontSize: 13 }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg text-white bg-warning hover:opacity-90 font-medium transition-colors shadow-sm"
            style={{ padding: "10px 20px", fontSize: 13 }}
          >
            Exclude {cascadeEntries.length + 1} {cascadeEntries.length + 1 === 1 ? "Table" : "Tables"}
          </button>
        </div>
      </div>
    </div>
  );
}
