import { isNonNegativeSafeInteger } from "../shared/money";
import { DEFAULT_TAX_RULE_SET_ID } from "../tax/rules/us-ca-w2-2026";
import {
  getSerializedPlanByteLength,
  MAX_GOALS_PER_CATEGORY,
  MAX_MONTHLY_GOAL_AMOUNT_CENTS,
  MAX_MONTHLY_GOAL_TOTAL_CENTS,
  MAX_MONTHLY_PRETAX_DEDUCTION_CENTS,
  MAX_PLAN_CATEGORIES,
  MAX_PLAN_GOALS,
  MAX_PLAN_UTF8_BYTES,
} from "./limits";
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
const CONSTRAINT_CODES = new Set([
  "too_many_categories",
  "too_many_goals_in_category",
  "too_many_goals",
  "plan_too_large",
  "goal_amount_too_large",
  "pretax_deduction_too_large",
  "goal_total_too_large",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addIssue(issues: PlanValidationIssue[], path: string, code: string, message: string) {
  issues.push({ path, code, message });
}

function validateKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: PlanValidationIssue[],
) {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      addIssue(
        issues,
        path === "$" ? key : `${path}.${key}`,
        "unexpected_field",
        "Field is not supported.",
      );
    }
  }
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
  validateKeys(
    value,
    ["id", "name", "monthlyAmountCents", "budgetMode", "pinned", "order"],
    path,
    issues,
  );
  validateUuid(value.id, `${path}.id`, issues, seenIds);
  validateName(value.name, `${path}.name`, issues);
  if (!isNonNegativeSafeInteger(value.monthlyAmountCents)) {
    addIssue(
      issues,
      `${path}.monthlyAmountCents`,
      "invalid_money",
      "Must be a non-negative integer number of cents.",
    );
  } else if (Number(value.monthlyAmountCents) > MAX_MONTHLY_GOAL_AMOUNT_CENTS) {
    addIssue(
      issues,
      `${path}.monthlyAmountCents`,
      "goal_amount_too_large",
      `Must not exceed ${MAX_MONTHLY_GOAL_AMOUNT_CENTS} cents per month.`,
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
  validateKeys(value, ["id", "name", "icon", "order", "goals"], path, issues);
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
    if (value.goals.length > MAX_GOALS_PER_CATEGORY) {
      addIssue(
        issues,
        `${path}.goals`,
        "too_many_goals_in_category",
        `A category may contain at most ${MAX_GOALS_PER_CATEGORY} goals.`,
      );
    }
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

  validateKeys(
    value,
    [
      "schemaVersion",
      "planId",
      "revision",
      "updatedAt",
      "updatedByDevice",
      "taxProfile",
      "preferences",
      "categories",
    ],
    "$",
    issues,
  );

  const serializedBytes = getSerializedPlanByteLength(value);
  if (serializedBytes > MAX_PLAN_UTF8_BYTES) {
    addIssue(
      issues,
      "$",
      "plan_too_large",
      `Canonical plan JSON must not exceed ${MAX_PLAN_UTF8_BYTES} UTF-8 bytes.`,
    );
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
    validateKeys(
      profile,
      [
        "state",
        "filingStatus",
        "monthlyPretaxDeductionCents",
        "bufferBasisPoints",
        "planningYear",
        "taxRuleVersion",
      ],
      "taxProfile",
      issues,
    );
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
    } else if (Number(profile.monthlyPretaxDeductionCents) > MAX_MONTHLY_PRETAX_DEDUCTION_CENTS) {
      addIssue(
        issues,
        "taxProfile.monthlyPretaxDeductionCents",
        "pretax_deduction_too_large",
        `Must not exceed ${MAX_MONTHLY_PRETAX_DEDUCTION_CENTS} cents per month.`,
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
    if (profile.taxRuleVersion !== DEFAULT_TAX_RULE_SET_ID) {
      addIssue(
        issues,
        "taxProfile.taxRuleVersion",
        "invalid_tax_rule_version",
        `Must use the supported tax rule set ${DEFAULT_TAX_RULE_SET_ID}.`,
      );
    }
  }

  if (!isRecord(value.preferences)) {
    addIssue(issues, "preferences", "invalid_preferences", "Must be an object.");
  } else {
    validateKeys(value.preferences, ["themeId"], "preferences", issues);
    if (
      typeof value.preferences.themeId !== "string" ||
      !THEME_IDS.has(value.preferences.themeId)
    ) {
      addIssue(issues, "preferences.themeId", "invalid_theme", "Unsupported theme.");
    }
  }

  if (!Array.isArray(value.categories)) {
    addIssue(issues, "categories", "invalid_categories", "Must be an array.");
  } else {
    if (value.categories.length > MAX_PLAN_CATEGORIES) {
      addIssue(
        issues,
        "categories",
        "too_many_categories",
        `A plan may contain at most ${MAX_PLAN_CATEGORIES} categories.`,
      );
    }
    let totalGoals = 0;
    let totalMonthlyGoalCents = 0;
    for (const category of value.categories) {
      if (!isRecord(category) || !Array.isArray(category.goals)) continue;
      totalGoals += category.goals.length;
      for (const goal of category.goals) {
        if (isRecord(goal) && isNonNegativeSafeInteger(goal.monthlyAmountCents)) {
          totalMonthlyGoalCents += Number(goal.monthlyAmountCents);
        }
      }
    }
    if (totalGoals > MAX_PLAN_GOALS) {
      addIssue(
        issues,
        "categories",
        "too_many_goals",
        `A plan may contain at most ${MAX_PLAN_GOALS} goals.`,
      );
    }
    if (totalMonthlyGoalCents > MAX_MONTHLY_GOAL_TOTAL_CENTS) {
      addIssue(
        issues,
        "categories",
        "goal_total_too_large",
        `Monthly goal amounts must not exceed ${MAX_MONTHLY_GOAL_TOTAL_CENTS} cents in total.`,
      );
    }
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

function constraintMessage(issues: PlanValidationIssue[]): string {
  const codes = new Set(issues.map((issue) => issue.code));
  if (codes.has("plan_too_large"))
    return "计划内容过多，最多可占用 256 KiB。请精简名称或项目后重试。";
  if (codes.has("too_many_categories")) return "一个计划最多可包含 50 个分类。";
  if (codes.has("too_many_goals_in_category")) return "每个分类最多可包含 200 个目标。";
  if (codes.has("too_many_goals")) return "一个计划最多可包含 500 个目标。";
  if (codes.has("goal_total_too_large")) return "全部目标的每月金额合计不能超过 $1,000,000。";
  if (codes.has("goal_amount_too_large")) return "单个目标的每月金额不能超过 $500,000。";
  if (codes.has("pretax_deduction_too_large")) return "每月税前扣除不能超过 $500,000。";
  return "计划超出当前支持的容量范围。";
}

export class PlanConstraintError extends PlanValidationError {
  constructor(issues: PlanValidationIssue[]) {
    super(issues);
    this.name = "PlanConstraintError";
    this.message = constraintMessage(issues);
  }
}

export function parsePlanDocument(value: unknown): PlanDocument {
  const result = validatePlanDocument(value);
  if (!result.ok) {
    const constraintIssues = result.issues.filter((issue) => CONSTRAINT_CODES.has(issue.code));
    if (constraintIssues.length > 0) throw new PlanConstraintError(constraintIssues);
    throw new PlanValidationError(result.issues);
  }
  return result.value;
}
