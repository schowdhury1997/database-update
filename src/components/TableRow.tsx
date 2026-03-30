import { Lock } from "lucide-react";
import { Tooltip } from "./Tooltip";
import type { TableInfo, TableActionType, FkLockInfo } from "../types";

interface TableRowProps {
  table: TableInfo;
  checked: boolean;
  action: TableActionType;
  rowLimit: number | null;
  lock: FkLockInfo | null;
  onToggle: (name: string) => void;
  onUnlock: (name: string) => void;
  onActionChange: (name: string, action: TableActionType, n?: number) => void;
  even: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

function formatCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
  if (count < 1000000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${(count / 1000000000).toFixed(1)}B`;
}

export function TableRow({
  table, checked, rowLimit, lock, onToggle, onUnlock, onActionChange, even,
}: TableRowProps) {
  const isLocked = lock?.locked ?? false;

  return (
    <div
      className={`flex items-center border-b border-border-subtle ${
        even ? "bg-bg-primary" : "bg-bg-secondary/40"
      } hover:bg-bg-hover transition-colors duration-100`}
      style={{ padding: "12px 24px", gap: 18, fontSize: 13 }}
    >
      {/* Checkbox */}
      <div style={{ width: 24 }} className="flex items-center justify-center flex-shrink-0">
        {isLocked ? (
          <input
            type="checkbox"
            checked={true}
            onChange={() => onUnlock(table.name)}
            className="accent-warning cursor-pointer rounded"
            style={{ width: 16, height: 16 }}
          />
        ) : (
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggle(table.name)}
            className="accent-accent cursor-pointer rounded"
            style={{ width: 16, height: 16 }}
          />
        )}
      </div>

      {/* Table name */}
      <div className="flex-1 min-w-0">
        <span className={`mono truncate block ${checked || isLocked ? "text-text-primary" : "text-text-tertiary"}`}
          style={{ fontSize: 13 }}>
          {table.name}
        </span>
      </div>

      {/* Size */}
      <div style={{ width: 88, textAlign: "right" }}>
        <span className="mono text-text-secondary rounded bg-bg-tertiary"
          style={{ fontSize: 11, padding: "3px 8px" }}>
          {formatBytes(table.estimated_data_bytes)}
        </span>
      </div>

      {/* Row count */}
      <div className="mono text-text-tertiary" style={{ width: 88, textAlign: "right", fontSize: 11 }}>
        {formatCount(table.estimated_row_count)} rows
      </div>

      {/* Row limit */}
      <div style={{ width: 120 }} className="flex-shrink-0">
        {checked || isLocked ? (
          isLocked ? (
            <Tooltip
              position="left"
              content={
                <div>
                  <p className="text-text-tertiary font-medium" style={{ fontSize: 11, marginBottom: 6 }}>
                    Required by
                  </p>
                  <div className="flex flex-col" style={{ gap: 3 }}>
                    {lock!.locked_by.map((t) => (
                      <span key={t} className="mono text-text-primary" style={{ fontSize: 12 }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              }
            >
              <span
                className="flex items-center text-warning/80 font-medium cursor-help"
                style={{ fontSize: 11, gap: 5 }}
              >
                <Lock size={12} />
                All rows (FK)
              </span>
            </Tooltip>
          ) : (
            <select
              value={rowLimit ? String(rowLimit) : "all"}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "all") onActionChange(table.name, "include_all");
                else onActionChange(table.name, "include_last_n", Number(val));
              }}
              style={{ width: "100%", fontSize: 11, padding: "5px 8px" }}
              className="rounded bg-bg-input border-border-default"
            >
              <option value="all">All rows</option>
              <option value="100">Last 100</option>
              <option value="500">Last 500</option>
              <option value="1000">Last 1,000</option>
              <option value="5000">Last 5,000</option>
              <option value="10000">Last 10,000</option>
            </select>
          )
        ) : (
          <span className="text-text-tertiary" style={{ fontSize: 11 }}>Excluded</span>
        )}
      </div>
    </div>
  );
}
