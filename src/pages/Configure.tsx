import { useState, useMemo, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Search,
  ArrowUpDown,
  CheckSquare,
  Square,
  Save,
  Play,
  Zap,
  ChevronLeft,
  Lock,
  Pencil,
  HardDrive,
} from "lucide-react";
import { TableRow } from "../components/TableRow";
import { DatabaseConfig } from "../components/DatabaseConfig";
import { CascadeUncheckModal } from "../components/CascadeUncheckModal";
import type {
  ScanResult,
  TableActionType,
  TableConfig,
  FkLockInfo,
  CascadeEntry,
  DockerConfig,
  CondenseConfig,
  Template,
} from "../types";

interface ConfigureProps {
  scanResult: ScanResult;
  filePath: string;
  initialTemplate?: Template | null;
  onCondense: (config: CondenseConfig) => void;
  onRunSql: (dockerConfig: DockerConfig, sqlPath: string) => void;
  onCondenseAndRun: (config: CondenseConfig, dockerConfig: DockerConfig) => void;
  onBack: () => void;
}

type SortField = "name" | "size" | "rows";
type FilterMode = "all" | "checked" | "unchecked" | "fk_locked" | "has_limit";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

export function Configure({
  scanResult, filePath, initialTemplate,
  onCondense, onRunSql, onCondenseAndRun, onBack,
}: ConfigureProps) {
  const [checkedTables, setCheckedTables] = useState<Set<string>>(() => {
    if (initialTemplate) {
      const checked = new Set<string>();
      for (const [name, config] of Object.entries(initialTemplate.table_configs)) {
        if (config.action !== "exclude_data") checked.add(name);
      }
      return checked;
    }
    return new Set(scanResult.tables.map((t) => t.name));
  });

  const [tableActions, setTableActions] = useState<Record<string, TableConfig>>(() => {
    if (initialTemplate) return { ...initialTemplate.table_configs };
    const a: Record<string, TableConfig> = {};
    for (const t of scanResult.tables) a[t.name] = { action: "include_all" };
    return a;
  });

  const [fkLocks, setFkLocks] = useState<FkLockInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  const [dockerConfig, setDockerConfig] = useState<DockerConfig>({
    compose_file_path: initialTemplate?.compose_file_path ?? "",
    service_name: initialTemplate?.service_name ?? "mysql",
    database_name: initialTemplate?.database_name ?? "",
  });

  const [cascadeModal, setCascadeModal] = useState<{
    targetTable: string;
    entries: CascadeEntry[];
  } | null>(null);

  const defaultOutputPath = useMemo(() => filePath.replace(/\.sql$/, "") + "_condensed.sql", [filePath]);
  const [outputPath, setOutputPath] = useState(defaultOutputPath);

  useEffect(() => {
    invoke<FkLockInfo[]>("compute_fk_locks", {
      fkGraphData: scanResult.fk_graph,
      checkedTables: Array.from(checkedTables),
    }).then(setFkLocks).catch(console.error);
  }, [checkedTables, scanResult.fk_graph]);

  const fkLockMap = useMemo(() => {
    const m: Record<string, FkLockInfo> = {};
    for (const l of fkLocks) m[l.table] = l;
    return m;
  }, [fkLocks]);

  const handleToggle = useCallback((name: string) => {
    setCheckedTables((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
        setTableActions((a) => ({ ...a, [name]: { action: "exclude_data" } }));
      } else {
        next.add(name);
        setTableActions((a) => ({ ...a, [name]: { action: "include_all" } }));
      }
      return next;
    });
  }, []);

  const handleActionChange = useCallback((name: string, action: TableActionType, n?: number) => {
    setTableActions((prev) => ({
      ...prev,
      [name]: action === "include_last_n" ? { action, n } : { action },
    }));
  }, []);

  const handleUnlock = useCallback(async (name: string) => {
    try {
      const entries = await invoke<CascadeEntry[]>("compute_cascade_uncheck", {
        fkGraphData: scanResult.fk_graph,
        checkedTables: Array.from(checkedTables),
        targetTable: name,
      });
      setCascadeModal({ targetTable: name, entries });
    } catch (e) {
      console.error(e);
    }
  }, [scanResult.fk_graph, checkedTables]);

  const handleCascadeConfirm = useCallback(() => {
    if (!cascadeModal) return;
    const { targetTable, entries } = cascadeModal;
    const tablesToUncheck = [targetTable, ...entries.map((e) => e.table)];

    setCheckedTables((prev) => {
      const next = new Set(prev);
      for (const t of tablesToUncheck) next.delete(t);
      return next;
    });
    setTableActions((prev) => {
      const next = { ...prev };
      for (const t of tablesToUncheck) next[t] = { action: "exclude_data" };
      return next;
    });

    setCascadeModal(null);
  }, [cascadeModal]);

  const filteredTables = useMemo(() => {
    let tables = [...scanResult.tables];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      tables = tables.filter((t) => t.name.toLowerCase().includes(q));
    }
    switch (filterMode) {
      case "checked": tables = tables.filter((t) => checkedTables.has(t.name)); break;
      case "unchecked": tables = tables.filter((t) => !checkedTables.has(t.name) && !fkLockMap[t.name]?.locked); break;
      case "fk_locked": tables = tables.filter((t) => fkLockMap[t.name]?.locked); break;
      case "has_limit": tables = tables.filter((t) => tableActions[t.name]?.action === "include_last_n"); break;
    }
    tables.sort((a, b) => {
      switch (sortField) {
        case "size": return b.estimated_data_bytes - a.estimated_data_bytes;
        case "rows": return b.estimated_row_count - a.estimated_row_count;
        default: return a.name.localeCompare(b.name);
      }
    });
    return tables;
  }, [scanResult.tables, searchQuery, filterMode, sortField, checkedTables, fkLockMap, tableActions]);

  const estimatedOutputSize = useMemo(() => {
    let total = 0;
    for (const table of scanResult.tables) {
      const c = tableActions[table.name];
      if (!c || c.action === "include_all") total += table.estimated_data_bytes;
      else if (c.action === "include_last_n" && c.n) {
        const avg = table.estimated_row_count > 0 ? table.estimated_data_bytes / table.estimated_row_count : 100;
        total += Math.min(c.n * avg, table.estimated_data_bytes);
      }
    }
    const fs = scanResult.tables.reduce((s, t) => s + t.estimated_data_bytes, 0);
    total += Math.max(fs * 0.02, 10_000_000);
    return total;
  }, [scanResult.tables, tableActions]);

  const buildCondenseConfig = (): CondenseConfig => ({
    source_path: filePath, output_path: outputPath, table_configs: { ...tableActions },
  });

  const handleSaveTemplate = async () => {
    const name = prompt("Template name:", dockerConfig.database_name ? `${dockerConfig.database_name}-template` : "my-template");
    if (!name) return;
    const template: Template = {
      name, database_name: dockerConfig.database_name, compose_file_path: dockerConfig.compose_file_path,
      service_name: dockerConfig.service_name, output_directory: outputPath.substring(0, outputPath.lastIndexOf("/")),
      s3_uri: null, aws_profile: null, download_directory: null, table_configs: { ...tableActions },
      last_used: new Date().toISOString(),
    };
    try { await invoke("save_template", { template }); } catch (e) { console.error(e); }
  };

  const checkedCount = checkedTables.size + fkLocks.filter((l) => l.locked).length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border-default" style={{ padding: "28px 32px 20px 32px" }}>
        <button
          onClick={onBack}
          className="flex items-center text-text-secondary hover:text-text-primary transition-colors"
          style={{ gap: 4, fontSize: 13, marginBottom: 12 }}
        >
          <ChevronLeft size={16} />
          Back
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600 }} className="text-text-primary">Configure Tables</h1>
            <div className="flex items-center" style={{ gap: 16, marginTop: 8 }}>
              <span className="mono text-text-tertiary" style={{ fontSize: 12 }}>{filePath.split("/").pop()}</span>
              <span className="text-text-tertiary" style={{ fontSize: 12 }}>{scanResult.tables.length} tables found</span>
            </div>
          </div>
          <div className="bg-bg-secondary rounded-lg border border-border-default flex items-center" style={{ gap: 10, padding: "10px 16px" }}>
            <HardDrive size={14} className="text-text-tertiary" />
            <span style={{ fontSize: 13 }} className="text-text-secondary">
              Est. output: <strong className="text-text-primary">{formatBytes(estimatedOutputSize)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center flex-shrink-0 bg-bg-secondary/50 border-b border-border-default"
        style={{ padding: "12px 32px", gap: 16 }}>
        <div className="relative" style={{ width: 220 }}>
          <Search size={15} className="absolute text-text-tertiary" style={{ left: 12, top: "50%", transform: "translateY(-50%)" }} />
          <input type="text" placeholder="Search tables..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%", paddingLeft: 38, paddingTop: 8, paddingBottom: 8, fontSize: 13 }}
          />
        </div>

        <div className="flex items-center bg-bg-tertiary rounded-lg" style={{ padding: 3, gap: 2 }}>
          {([["all", "All"], ["checked", "Included"], ["unchecked", "Excluded"], ["fk_locked", "FK-Locked"], ["has_limit", "Limited"]] as [FilterMode, string][]).map(([value, label]) => (
            <button key={value} onClick={() => setFilterMode(value)}
              className={`rounded-md font-medium transition-colors ${
                filterMode === value ? "bg-bg-elevated text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
              }`}
              style={{ padding: "6px 12px", fontSize: 12 }}
            >{label}</button>
          ))}
        </div>

        <div className="flex items-center" style={{ gap: 8, marginLeft: "auto" }}>
          <button onClick={() => setSortField((p) => p === "name" ? "size" : p === "size" ? "rows" : "name")}
            className="flex items-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
            style={{ gap: 6, padding: "6px 12px", fontSize: 12 }}>
            <ArrowUpDown size={14} />
            {sortField === "name" ? "Name" : sortField === "size" ? "Size" : "Rows"}
          </button>
          <div className="bg-border-default" style={{ width: 1, height: 20 }} />
          <button onClick={() => setCheckedTables(new Set(scanResult.tables.map((t) => t.name)))}
            className="flex items-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
            style={{ gap: 6, padding: "6px 12px", fontSize: 12 }}>
            <CheckSquare size={14} /> All
          </button>
          <button onClick={() => setCheckedTables(new Set())}
            className="flex items-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
            style={{ gap: 6, padding: "6px 12px", fontSize: 12 }}>
            <Square size={14} /> None
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center border-b border-border-subtle flex-shrink-0 bg-bg-secondary/30 uppercase tracking-wider text-text-tertiary font-medium"
        style={{ padding: "10px 24px", gap: 18, fontSize: 10 }}>
        <div style={{ width: 24 }} />
        <div className="flex-1">Table</div>
        <div style={{ width: 88, textAlign: "right" }}>Size</div>
        <div style={{ width: 88, textAlign: "right" }}>Rows</div>
        <div style={{ width: 120 }}>Limit</div>
      </div>

      {/* Table list */}
      <div className="flex-1 overflow-y-auto">
        {filteredTables.map((table, i) => {
          const config = tableActions[table.name];
          const isChecked = checkedTables.has(table.name) || fkLockMap[table.name]?.locked;
          return (
            <TableRow key={table.name} table={table} checked={isChecked ?? false}
              action={config?.action ?? "include_all"}
              rowLimit={config?.action === "include_last_n" ? (config.n ?? null) : null}
              lock={fkLockMap[table.name] ?? null}
              onToggle={handleToggle} onUnlock={handleUnlock} onActionChange={handleActionChange} even={i % 2 === 0}
            />
          );
        })}
        {filteredTables.length === 0 && (
          <div className="flex items-center justify-center text-text-tertiary" style={{ padding: "64px 0", fontSize: 14 }}>
            No tables match the current filter
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div className="flex-shrink-0 border-t border-border-default bg-bg-secondary">
        {/* Output path */}
        <div className="flex items-center border-b border-border-subtle" style={{ padding: "14px 32px", gap: 14 }}>
          <span style={{ fontSize: 13 }} className="text-text-secondary flex-shrink-0">Output file:</span>
          <span className="mono text-text-tertiary truncate flex-1" style={{ fontSize: 12 }}>{outputPath}</span>
          <button onClick={() => { const p = prompt("Output path:", outputPath); if (p) setOutputPath(p); }}
            className="flex items-center text-accent hover:text-accent-hover transition-colors flex-shrink-0"
            style={{ gap: 5, fontSize: 12 }}>
            <Pencil size={12} /> Change
          </button>
        </div>

        {/* Docker config */}
        <div className="border-b border-border-subtle" style={{ padding: "20px 32px" }}>
          <DatabaseConfig config={dockerConfig} onChange={setDockerConfig} />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between" style={{ padding: "18px 32px" }}>
          <div className="flex items-center" style={{ gap: 20 }}>
            <span style={{ fontSize: 13 }} className="text-text-secondary">
              {checkedCount} of {scanResult.tables.length} tables included
            </span>
            <span className="flex items-center text-text-tertiary" style={{ gap: 5, fontSize: 13 }}>
              <Lock size={12} /> {fkLocks.filter((l) => l.locked).length} FK-locked
            </span>
          </div>
          <div className="flex items-center" style={{ gap: 12 }}>
            <button onClick={handleSaveTemplate}
              className="flex items-center rounded-lg text-text-secondary bg-bg-tertiary hover:bg-bg-hover border border-border-default transition-colors"
              style={{ gap: 8, padding: "10px 18px", fontSize: 13 }}>
              <Save size={15} /> Save Template
            </button>
            <button onClick={() => onRunSql(dockerConfig, filePath)}
              className="flex items-center rounded-lg text-text-secondary bg-bg-tertiary hover:bg-bg-hover border border-border-default transition-colors"
              style={{ gap: 8, padding: "10px 18px", fontSize: 13 }}>
              <Play size={15} /> Run SQL Only
            </button>
            <button onClick={() => onCondense(buildCondenseConfig())}
              className="flex items-center rounded-lg text-white bg-accent hover:bg-accent-hover font-medium transition-colors shadow-sm"
              style={{ gap: 8, padding: "10px 20px", fontSize: 13 }}>
              <Zap size={15} /> Condense
            </button>
            <button onClick={() => onCondenseAndRun(buildCondenseConfig(), dockerConfig)}
              className="flex items-center rounded-lg text-text-inverse bg-success hover:opacity-90 font-medium transition-colors shadow-sm"
              style={{ gap: 8, padding: "10px 20px", fontSize: 13 }}>
              <Play size={15} /> Condense & Run
            </button>
          </div>
        </div>
      </div>

      {cascadeModal && (
        <CascadeUncheckModal
          targetTable={cascadeModal.targetTable}
          cascadeEntries={cascadeModal.entries}
          onConfirm={handleCascadeConfirm}
          onCancel={() => setCascadeModal(null)}
        />
      )}
    </div>
  );
}
