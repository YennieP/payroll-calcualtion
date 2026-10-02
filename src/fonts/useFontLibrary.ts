import { useCallback, useSyncExternalStore } from "react";

import {
  getFontLibraryState,
  retryFontWarmup,
  subscribeFontLibraryState,
  type FontLibraryState,
} from "./fontLoader";

export interface FontLibraryViewState extends FontLibraryState {
  retry: () => Promise<void>;
}

export function useFontLibrary(): FontLibraryViewState {
  const state = useSyncExternalStore(
    subscribeFontLibraryState,
    getFontLibraryState,
    getFontLibraryState,
  );
  const retry = useCallback(() => retryFontWarmup(), []);
  return { ...state, retry };
}
