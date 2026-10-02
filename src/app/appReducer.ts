import {
  addCategory,
  addGoal,
  deleteCategory,
  deleteGoal,
  moveCategory,
  moveGoalToCategory,
  moveGoalWithinCategory,
  PlanConstraintError,
  selectTheme,
  updateCategory,
  updateGoal,
  updateTaxProfile,
} from "../domain/plan";
import type {
  FilingStatus,
  Goal,
  NewCategoryInput,
  NewGoalInput,
  PlanDocument,
  ThemeId,
} from "../domain/plan";
import type { MutationMetadata } from "../domain/plan/commands";

export type SaveStatus = "loading" | "local-change" | "saving" | "saved" | "error" | "conflict";

export interface AppState {
  plan: PlanDocument;
  deviceId: string;
  activeCategoryId: string | null;
  searchQuery: string;
  visibleGoalCounts: Record<string, number>;
  themePanelOpen: boolean;
  taxProfileOpen: boolean;
  taxDetailsOpen: boolean;
  managePinnedOpen: boolean;
  categorySettingsOpen: boolean;
  saveStatus: SaveStatus;
  saveError: string | null;
  conflictingPlan: PlanDocument | null;
  constraintError: string | null;
  constraintSequence: number;
  editSequence: number;
}

interface MutationActionBase {
  metadata: MutationMetadata;
}

export type AppAction =
  | { type: "plan-loaded"; plan: PlanDocument; isNew: boolean }
  | { type: "plan-imported"; plan: PlanDocument }
  | { type: "plan-deleted"; replacement: PlanDocument }
  | { type: "storage-failed"; message: string }
  | { type: "constraint-dismissed" }
  | { type: "navigate-pinned" }
  | { type: "navigate-category"; categoryId: string }
  | { type: "search-changed"; query: string }
  | {
      type: "panel-toggled";
      panel: "theme" | "tax-profile" | "tax-details" | "pinned" | "category";
    }
  | ({ type: "theme-selected"; themeId: ThemeId } & MutationActionBase)
  | ({ type: "category-added"; input: NewCategoryInput } & MutationActionBase)
  | ({
      type: "category-updated";
      categoryId: string;
      name: string;
      icon: string;
    } & MutationActionBase)
  | ({ type: "category-deleted"; categoryId: string } & MutationActionBase)
  | ({ type: "category-moved"; categoryId: string; direction: -1 | 1 } & MutationActionBase)
  | ({ type: "goal-added"; categoryId: string; input: NewGoalInput } & MutationActionBase)
  | ({
      type: "goal-updated";
      categoryId: string;
      goalId: string;
      changes: Partial<Goal>;
    } & MutationActionBase)
  | ({ type: "goal-deleted"; categoryId: string; goalId: string } & MutationActionBase)
  | ({
      type: "goal-reordered";
      categoryId: string;
      goalId: string;
      direction: -1 | 1;
    } & MutationActionBase)
  | ({
      type: "goal-moved";
      categoryId: string;
      goalId: string;
      targetCategoryId: string;
    } & MutationActionBase)
  | ({
      type: "tax-profile-updated";
      changes: {
        filingStatus?: FilingStatus;
        monthlyPretaxDeductionCents?: number;
        bufferBasisPoints?: number;
      };
    } & MutationActionBase)
  | { type: "more-goals-revealed"; categoryId: string }
  | { type: "save-started" }
  | { type: "plan-saved"; revision: number; editSequence: number }
  | { type: "save-conflicted"; remote: PlanDocument }
  | { type: "remote-received"; remote: PlanDocument }
  | { type: "remote-accepted" }
  | { type: "local-kept" };

export function createInitialAppState(plan: PlanDocument, deviceId: string): AppState {
  return {
    plan,
    deviceId,
    activeCategoryId: null,
    searchQuery: "",
    visibleGoalCounts: {},
    themePanelOpen: false,
    taxProfileOpen: false,
    taxDetailsOpen: false,
    managePinnedOpen: false,
    categorySettingsOpen: false,
    saveStatus: "loading",
    saveError: null,
    conflictingPlan: null,
    constraintError: null,
    constraintSequence: 0,
    editSequence: 0,
  };
}

function withMutation(state: AppState, plan: PlanDocument): AppState {
  if (plan === state.plan) return state;
  return {
    ...state,
    plan,
    saveStatus: "local-change",
    saveError: null,
    constraintError: null,
    editSequence: state.editSequence + 1,
  };
}

function reduceAppState(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "plan-loaded":
      return {
        ...state,
        plan: action.plan,
        saveStatus: action.isNew ? "local-change" : "saved",
        saveError: null,
        constraintError: null,
      };
    case "plan-imported":
      return {
        ...state,
        plan: action.plan,
        activeCategoryId: null,
        searchQuery: "",
        saveStatus: "local-change",
        saveError: null,
        conflictingPlan: null,
        constraintError: null,
        editSequence: state.editSequence + 1,
      };
    case "plan-deleted":
      return {
        ...state,
        plan: action.replacement,
        activeCategoryId: null,
        searchQuery: "",
        saveStatus: "saved",
        saveError: null,
        conflictingPlan: null,
        constraintError: null,
        editSequence: state.editSequence + 1,
      };
    case "storage-failed":
      return { ...state, saveStatus: "error", saveError: action.message };
    case "constraint-dismissed":
      return { ...state, constraintError: null };
    case "navigate-pinned":
      return {
        ...state,
        activeCategoryId: null,
        searchQuery: "",
        categorySettingsOpen: false,
      };
    case "navigate-category":
      return {
        ...state,
        activeCategoryId: action.categoryId,
        searchQuery: "",
        managePinnedOpen: false,
        categorySettingsOpen: false,
      };
    case "search-changed":
      return { ...state, searchQuery: action.query };
    case "panel-toggled": {
      const key = {
        theme: "themePanelOpen",
        "tax-profile": "taxProfileOpen",
        "tax-details": "taxDetailsOpen",
        pinned: "managePinnedOpen",
        category: "categorySettingsOpen",
      }[action.panel] as keyof AppState;
      return { ...state, [key]: !state[key] };
    }
    case "theme-selected":
      return {
        ...withMutation(state, selectTheme(state.plan, action.themeId, action.metadata)),
        themePanelOpen: false,
      };
    case "category-added": {
      const plan = addCategory(state.plan, action.input, action.metadata);
      return {
        ...withMutation(state, plan),
        activeCategoryId: action.input.id,
        categorySettingsOpen: true,
      };
    }
    case "category-updated":
      return withMutation(
        state,
        updateCategory(
          state.plan,
          action.categoryId,
          { name: action.name, icon: action.icon },
          action.metadata,
        ),
      );
    case "category-deleted":
      return {
        ...withMutation(state, deleteCategory(state.plan, action.categoryId, action.metadata)),
        activeCategoryId:
          state.activeCategoryId === action.categoryId ? null : state.activeCategoryId,
        categorySettingsOpen: false,
      };
    case "category-moved":
      return withMutation(
        state,
        moveCategory(state.plan, action.categoryId, action.direction, action.metadata),
      );
    case "goal-added":
      return withMutation(
        state,
        addGoal(state.plan, action.categoryId, action.input, action.metadata),
      );
    case "goal-updated":
      return withMutation(
        state,
        updateGoal(state.plan, action.categoryId, action.goalId, action.changes, action.metadata),
      );
    case "goal-deleted":
      return withMutation(
        state,
        deleteGoal(state.plan, action.categoryId, action.goalId, action.metadata),
      );
    case "goal-reordered":
      return withMutation(
        state,
        moveGoalWithinCategory(
          state.plan,
          action.categoryId,
          action.goalId,
          action.direction,
          action.metadata,
        ),
      );
    case "goal-moved":
      return withMutation(
        state,
        moveGoalToCategory(
          state.plan,
          action.categoryId,
          action.goalId,
          action.targetCategoryId,
          action.metadata,
        ),
      );
    case "tax-profile-updated":
      return withMutation(state, updateTaxProfile(state.plan, action.changes, action.metadata));
    case "more-goals-revealed":
      return {
        ...state,
        visibleGoalCounts: {
          ...state.visibleGoalCounts,
          [action.categoryId]: (state.visibleGoalCounts[action.categoryId] ?? 6) + 8,
        },
      };
    case "save-started":
      return { ...state, saveStatus: "saving", saveError: null };
    case "plan-saved":
      return {
        ...state,
        plan: { ...state.plan, revision: action.revision },
        saveStatus: state.editSequence === action.editSequence ? "saved" : "local-change",
      };
    case "save-conflicted":
      return { ...state, saveStatus: "conflict", conflictingPlan: action.remote };
    case "remote-received":
      if (action.remote.updatedByDevice === state.deviceId) return state;
      if (state.saveStatus === "local-change" || state.saveStatus === "saving") {
        return { ...state, saveStatus: "conflict", conflictingPlan: action.remote };
      }
      return { ...state, plan: action.remote, saveStatus: "saved" };
    case "remote-accepted":
      return state.conflictingPlan
        ? { ...state, plan: state.conflictingPlan, conflictingPlan: null, saveStatus: "saved" }
        : state;
    case "local-kept":
      return state.conflictingPlan
        ? {
            ...state,
            plan: { ...state.plan, revision: state.conflictingPlan.revision },
            conflictingPlan: null,
            saveStatus: "local-change",
            editSequence: state.editSequence + 1,
          }
        : state;
  }
}

export function appReducer(state: AppState, action: AppAction): AppState {
  try {
    return reduceAppState(state, action);
  } catch (error: unknown) {
    if (!(error instanceof PlanConstraintError)) throw error;
    return {
      ...state,
      constraintError: error.message,
      constraintSequence: state.constraintSequence + 1,
    };
  }
}
