import type { ThemeId } from "../domain/plan/types";

export interface AppState {
  phase: "foundation";
  themeId: ThemeId;
}

export type AppAction = { type: "theme-selected"; themeId: ThemeId };

export const initialAppState: AppState = {
  phase: "foundation",
  themeId: "rouge",
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "theme-selected":
      return { ...state, themeId: action.themeId };
  }
}
