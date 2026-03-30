import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ProgressEvent } from "../types";

export function useProgress() {
  const [progress, setProgress] = useState<ProgressEvent | null>(null);

  useEffect(() => {
    const unlisten = listen<ProgressEvent>("progress", (event) => {
      setProgress(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return progress;
}
