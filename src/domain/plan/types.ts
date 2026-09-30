import type { BasisPoints, MoneyCents } from "../shared/money";
import type { FilingStatus } from "../tax/types";

export type { BasisPoints, FilingStatus, MoneyCents };

export const CURRENT_PLAN_SCHEMA_VERSION = 1 as const;

export type ThemeId =
  | "rouge"
  | "midnight"
  | "violet-amber"
  | "violet-crimson"
  | "violet-blue"
  | "gold-opera"
  | "scarlet-opera";

export type BudgetMode = "monthly-fixed" | "monthly-variable" | "monthly-average";

/** IDs are persisted UUID strings generated outside the framework-independent domain. */
export type EntityId = string;

export interface Goal {
  id: EntityId;
  name: string;
  monthlyAmountCents: MoneyCents;
  budgetMode: BudgetMode;
  pinned: boolean;
  order: number;
}

export interface Category {
  id: EntityId;
  name: string;
  icon: string;
  order: number;
  goals: Goal[];
}

export interface TaxProfile {
  state: "CA";
  filingStatus: FilingStatus;
  monthlyPretaxDeductionCents: MoneyCents;
  bufferBasisPoints: BasisPoints;
  planningYear: 2026;
  taxRuleVersion: string;
}

export interface PlanPreferences {
  themeId: ThemeId;
}

export interface PlanDocument {
  schemaVersion: typeof CURRENT_PLAN_SCHEMA_VERSION;
  planId: EntityId;
  revision: number;
  updatedAt: string;
  updatedByDevice: EntityId;
  taxProfile: TaxProfile;
  preferences: PlanPreferences;
  categories: Category[];
}
