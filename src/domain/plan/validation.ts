import { isNonNegativeSafeInteger } from "../shared/money";
import { CURRENT_PLAN_SCHEMA_VERSION } from "./types";
import type { PlanDocument } from "./types";

export interface PlanValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type PlanValidationResult =
  { ok: true; value: PlanDocument } | { ok: false; issues: PlanValidationIssue[] };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const THEME_IDS = new Set([
  "rouge",
  "midnight",
  "violet-amber",
  "violet-crimson",
  "violet-blue",
  "gold-opera",
  "scarlet-opera",
]);
const FILING_STATUSES = new Set(["single", "married", "head"]);
const BUDGET_MODES = new Set(["monthly-fixed", "monthly-variable", "monthly-average"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addIssue(issues: PlanValidationIssue[], path: string, code: string, message: string) {
  issues.push({ path, code, message });
}

function validateUuid(
  value: unknown,
  path: string,
  issues: PlanValidationIssue[],
  seenIds: Set<string>,
) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    addIssue(issues, path, "invalid_uuid", "Must be a valid UUID.");
    return;
  }
  if (seenIds.has(value)) {
    addIssue(issues, path, "duplicate_uuid", "IDs must be unique within a plan.");
    return;
  }
  seenIds.add(value);
}

function validateName(value: unknown, path: string, issues: PlanValidationIssue[]) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 120) {
    addIssue(issues, path, "invalid_name", "Must contain 1 to 120 characters.");
  }
}

function validateGoal(
  value: unknown,
  path: string,
  issues: PlanValidationIssue[],
  seenIds: Set<string>,
) {
  if (!isRecord(value)) {
    addIssue(issues, path, "invalid_goal", "Must be an object.");
    return;
  }
  validateUuid(value.id, `${path}.id`, issues, seenIds);
  validateName(value.name, `${path}.name`, issues);
  if (!isNonNegativeSafeInteger(value.monthlyAmountCents)) {
    addIssue(
      issues,
      `${path}.monthlyAmountCents`,
      "invalid_money",
      "Must be a non-negative integer number of cents.",
    );
  }
  if (typeof value.budgetMode !== "string" || !BUDGET_MODES.has(value.budgetMode)) {
    addIssue(issues, `${path}.budgetMode`, "invalid_budget_mode", "Unsupported budget mode.");
  }
  if (typeof value.pinned !== "boolean") {
    addIssue(issues, `${path}.pinned`, "invalid_boolean", "Must be a boolean.");
  }
  if (!isNonNegativeSafeInteger(value.order)) {
    addIssue(issues, `${path}.order`, "invalid_order", "Must be a non-negative integer.");
  }
}

function validateCategory(
  value: unknown,
  path: string,
  issues: PlanValidationIssue[],
  seenIds: Set<string>,
) {
  if (!isRecord(value)) {
    addIssue(issues, path, "invalid_category", "Must be an object.");
    return;
  }
  validateUuid(value.id, `${path}.id`, issues, seenIds);
  validateName(value.name, `${path}.name`, issues);
  if (typeof value.icon !== "string" || value.icon.trim().length === 0 || value.icon.length > 16) {
    addIssue(issues, `${path}.icon`, "invalid_icon", "Must contain 1 to 16 characters.");
  }
  if (!isNonNegativeSafeInteger(value.order)) {
    addIssue(issues, `${path}.order`, "invalid_order", "Must be a non-negative integer.");
  }
  if (!Array.isArray(value.goals)) {
    addIssue(issues, `${path}.goals`, "invalid_goals", "Must be an array.");
  } else {
    value.goals.forEach((goal, index) =>
      validateGoal(goal, `${path}.goals[${index}]`, issues, seenIds),
    );
  }
}

export function validatePlanDocument(value: unknown): PlanValidationResult {
  const issues: PlanValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "$", code: "invalid_document", message: "Plan must be an object." }],
    };
  }

  if (value.schemaVersion !== CURRENT_PLAN_SCHEMA_VERSION) {
    addIssue(
      issues,
      "schemaVersion",
      "unsupported_schema",
      `Expected schema version ${CURRENT_PLAN_SCHEMA_VERSION}.`,
    );
  }

  const seenIds = new Set<string>();
  validateUuid(value.planId, "planId", issues, seenIds);
  validateUuid(value.updatedByDevice, "updatedByDevice", issues, seenIds);
  if (!isNonNegativeSafeInteger(value.revision)) {
    addIssue(issues, "revision", "invalid_revision", "Must be a non-negative integer.");
  }
  if (
    typeof value.updatedAt !== "string" ||
    value.updatedAt.length === 0 ||
    !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    addIssue(issues, "updatedAt", "invalid_timestamp", "Must be an ISO-compatible timestamp.");
  }

  if (!isRecord(value.taxProfile)) {
    addIssue(issues, "taxProfile", "invalid_tax_profile", "Must be an object.");
  } else {
    const profile = value.taxProfile;
    if (profile.state !== "CA") {
      addIssue(issues, "taxProfile.state", "unsupported_state", "MVP supports CA only.");
    }
    if (typeof profile.filingStatus !== "string" || !FILING_STATUSES.has(profile.filingStatus)) {
      addIssue(
        issues,
        "taxProfile.filingStatus",
        "invalid_filing_status",
        "Unsupported filing status.",
      );
    }
    if (!isNonNegativeSafeInteger(profile.monthlyPretaxDeductionCents)) {
      addIssue(
        issues,
        "taxProfile.monthlyPretaxDeductionCents",
        "invalid_money",
        "Must be a non-negative integer number of cents.",
      );
    }
    if (
      !isNonNegativeSafeInteger(profile.bufferBasisPoints) ||
      Number(profile.bufferBasisPoints) > 10_000
    ) {
      addIssue(
        issues,
        "taxProfile.bufferBasisPoints",
        "invalid_basis_points",
        "Must be an integer from 0 through 10000.",
      );
    }
    if (profile.planningYear !== 2026) {
      addIssue(
        issues,
        "taxProfile.planningYear",
        "unsupported_planning_year",
        "MVP supports planning year 2026 only.",
      );
    }
    if (typeof profile.taxRuleVersion !== "string" || profile.taxRuleVersion.length === 0) {
      addIssue(
        issues,
        "taxProfile.taxRuleVersion",
        "invalid_tax_rule_version",
        "Must identify a versioned tax rule set.",
      );
    }
  }

  if (!isRecord(value.preferences)) {
    addIssue(issues, "preferences", "invalid_preferences", "Must be an object.");
  } else if (
    typeof value.preferences.themeId !== "string" ||
    !THEME_IDS.has(value.preferences.themeId)
  ) {
    addIssue(issues, "preferences.themeId", "invalid_theme", "Unsupported theme.");
  }

  if (!Array.isArray(value.categories)) {
    addIssue(issues, "categories", "invalid_categories", "Must be an array.");
  } else {
    value.categories.forEach((category, index) =>
      validateCategory(category, `categories[${index}]`, issues, seenIds),
    );
  }

  return issues.length === 0
    ? { ok: true, value: value as unknown as PlanDocument }
    : { ok: false, issues };
}

export class PlanValidationError extends Error {
  readonly issues: PlanValidationIssue[];

  constructor(issues: PlanValidationIssue[]) {
    super(`Plan validation failed with ${issues.length} issue(s).`);
    this.name = "PlanValidationError";
    this.issues = issues;
  }
}

export function parsePlanDocument(value: unknown): PlanDocument {
  const result = validatePlanDocument(value);
  if (!result.ok) throw new PlanValidationError(result.issues);
  return result.value;
}
