import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FileText, Download, Upload, Trash2, Play, XCircle,
  LayoutTemplate, Database, ChevronRight,
} from "lucide-react";
import type { Template } from "../types";

interface TemplatesProps {
  onBack: () => void;
  onLoadTemplate: (template: Template) => void;
}

export function Templates({ onLoadTemplate }: TemplatesProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try { setTemplates(await invoke<Template[]>("list_templates")); }
    catch (e) { setError(typeof e === "string" ? e : String(e)); }
  };

  useEffect(() => { refresh(); }, []);

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete template "${name}"?`)) return;
    try { await invoke("delete_template", { name }); await refresh(); }
    catch (e) { setError(typeof e === "string" ? e : String(e)); }
  };

  const handleExport = async (name: string) => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const path = await save({ defaultPath: `${name}.json`, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (path) await invoke("export_template", { name, path });
    } catch (e) { setError(typeof e === "string" ? e : String(e)); }
  };

  const handleImport = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({ filters: [{ name: "JSON", extensions: ["json"] }], multiple: false });
      if (path) { await invoke("import_template", { path: path as string }); await refresh(); }
    } catch (e) { setError(typeof e === "string" ? e : String(e)); }
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between" style={{ padding: "40px 48px 20px 48px" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600 }} className="text-text-primary">Templates</h1>
          <p style={{ fontSize: 14, marginTop: 8 }} className="text-text-secondary">
            Save and reuse table configurations across imports
          </p>
        </div>
        <button onClick={handleImport}
          className="flex items-center bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors shadow-sm"
          style={{ gap: 10, padding: "12px 22px", fontSize: 14 }}>
          <Upload size={16} /> Import Template
        </button>
      </div>

      <div style={{ padding: "0 48px 48px 48px" }} className="flex-1">
        {error && (
          <div className="flex items-start bg-error-muted border border-error/20 rounded-xl"
            style={{ gap: 14, padding: 20, marginBottom: 28 }}>
            <XCircle size={18} className="text-error flex-shrink-0 mt-0.5" />
            <div style={{ fontSize: 14 }} className="text-error">{error}</div>
          </div>
        )}

        {templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center" style={{ paddingTop: 100 }}>
            <div className="rounded-2xl bg-bg-tertiary flex items-center justify-center"
              style={{ width: 72, height: 72, marginBottom: 24 }}>
              <LayoutTemplate size={32} className="text-text-tertiary" />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }} className="text-text-primary">
              No templates yet
            </h3>
            <p style={{ fontSize: 14, maxWidth: 380 }} className="text-text-tertiary text-center">
              Create a template from the Configure screen to save your table settings for future imports
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {templates.map((t) => (
              <div key={t.name}
                className="bg-bg-secondary border border-border-default rounded-xl flex items-center group hover:border-border-focus/30 transition-colors"
                style={{ padding: "22px 24px", gap: 20 }}>
                <div className="rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0"
                  style={{ width: 48, height: 48 }}>
                  <FileText size={22} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 15, fontWeight: 500 }} className="text-text-primary">{t.name}</div>
                  <div className="flex items-center" style={{ gap: 14, marginTop: 6 }}>
                    <span className="flex items-center text-text-tertiary" style={{ gap: 5, fontSize: 12 }}>
                      <Database size={12} /> {t.database_name || "No database"}
                    </span>
                    <span style={{ fontSize: 12 }} className="text-text-tertiary">
                      {Object.keys(t.table_configs).length} table configs
                    </span>
                    {t.s3_uri && <span style={{ fontSize: 12 }} className="text-accent/70">S3 source</span>}
                  </div>
                </div>
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ gap: 8 }}>
                  <button onClick={() => onLoadTemplate(t)}
                    className="flex items-center rounded-lg font-medium text-white bg-accent hover:bg-accent-hover transition-colors"
                    style={{ gap: 6, padding: "8px 16px", fontSize: 12 }}>
                    <Play size={13} /> Load
                  </button>
                  <button onClick={() => handleExport(t.name)}
                    className="rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
                    style={{ padding: 8 }} title="Export">
                    <Download size={16} />
                  </button>
                  <button onClick={() => handleDelete(t.name)}
                    className="rounded-lg text-text-secondary hover:text-error hover:bg-error-muted transition-colors"
                    style={{ padding: 8 }} title="Delete">
                    <Trash2 size={16} />
                  </button>
                </div>
                <ChevronRight size={18} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
