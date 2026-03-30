import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Template } from "../types";

export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<Template[]>("list_templates");
      setTemplates(result);
      setError(null);
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    async (template: Template) => {
      await invoke("save_template", { template });
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (name: string) => {
      await invoke("delete_template", { name });
      await refresh();
    },
    [refresh]
  );

  return { templates, loading, error, refresh, save, remove };
}
