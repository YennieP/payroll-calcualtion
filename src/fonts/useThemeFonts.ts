import { useEffect, useState } from "react";

import type { ThemeId } from "../domain/plan";
import { loadThemeFonts, startIdleFontWarmup, type FontAuditFailure } from "./fontLoader";

export type ThemeFontStatus = "loading" | "ready" | "fallback";

export interface ThemeFontState {
  status: ThemeFontStatus;
  failures: readonly FontAuditFailure[];
}

export function useThemeFonts(themeId: ThemeId): ThemeFontState {
  const [loadedState, setLoadedState] = useState<ThemeFontState & { themeId: ThemeId }>({
    themeId,
    status: "loading",
    failures: [],
  });

  useEffect(() => {
    let cancelled = false;
    loadThemeFonts(themeId)
      .then((result) => {
        if (cancelled) return;
        setLoadedState({
          themeId,
          status: result.failures.length === 0 ? "ready" : "fallback",
          failures: result.failures,
        });
        startIdleFontWarmup(themeId);
      })
      .catch(() => {
        if (!cancelled) setLoadedState({ themeId, status: "fallback", failures: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [themeId]);

  return loadedState.themeId === themeId ? loadedState : { status: "loading", failures: [] };
}
