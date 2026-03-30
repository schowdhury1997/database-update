import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ProgressEvent } from "../types";

export function useProgress() {
  const [progress, setProgress] = useState<ProgressEvent | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    listen<ProgressEvent>("progress", (event) => {
      if (!cancelled) {
        setProgress(event.payload);
      }
    }).then((fn) => {
      if (cancelled) {
        // Component unmounted before listener was registered — clean up immediately
        fn();
      } else {
        unlistenFn = fn;
      }
    });

    return () => {
      cancelled = true;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  return progress;
}
