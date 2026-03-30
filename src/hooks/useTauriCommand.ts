import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UseTauriCommandResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  execute: (...args: unknown[]) => Promise<T | null>;
}

export function useTauriCommand<T>(
  command: string
): UseTauriCommandResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = useCallback(
    async (...args: unknown[]) => {
      setLoading(true);
      setError(null);
      try {
        const params = args[0] as Record<string, unknown> | undefined;
        const result = await invoke<T>(command, params ?? {});
        setData(result);
        setLoading(false);
        return result;
      } catch (e) {
        const errMsg = typeof e === "string" ? e : (e as Error).message ?? String(e);
        setError(errMsg);
        setLoading(false);
        return null;
      }
    },
    [command]
  );

  return { data, error, loading, execute };
}
