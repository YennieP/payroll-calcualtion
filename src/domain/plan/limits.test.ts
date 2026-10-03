import { describe, expect, it } from "vitest";

import { createSamplePlan } from "../../application/samplePlan";
import { createPlanWithSerializedBytes, growPlanByOneByte } from "../../test/planFixtures";
import { selectIncomeProjection } from "./selectors";
import type { Category, Goal, PlanDocument } from "./types";
import {
  getSerializedPlanByteLength,
  MAX_GOALS_PER_CATEGORY,
  MAX_MONTHLY_GOAL_AMOUNT_CENTS,
  MAX_MONTHLY_GOAL_TOTAL_CENTS,
  MAX_MONTHLY_PRETAX_DEDUCTION_CENTS,
  MAX_PLAN_CATEGORIES,
  MAX_PLAN_GOALS,
  MAX_PLAN_REVISION,
  MAX_PLAN_UTF8_BYTES,
  utf8ByteLength,
} from "./limits";
import { parsePlanDocument, PlanConstraintError, validatePlanDocument } from "./validation";

const DEVICE_ID = "30000000-0000-4000-8000-000000000001";

function goal(index: number): Goal {
  return {
    id: `42000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `目标 ${index}`,
    monthlyAmountCents: 0,
    budgetMode: "monthly-fixed",
    pinned: false,
    order: index,
  };
}

function category(index: number, goals: Goal[] = []): Category {
  return {
    id: `41000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `分类 ${index}`,
    icon: "◇",
    order: index,
    goals,
  };
}

function issueCodes(plan: unknown): string[] {
  const result = validatePlanDocument(plan);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe("plan capacity and money contract", () => {
  it("measures canonical JSON in UTF-8 bytes, including non-BMP glyphs", () => {
    expect(utf8ByteLength("A中🎭")).toBe(8);
  });

  it("accepts the exact serialized-size boundary and rejects one byte more", () => {
    const exact = createPlanWithSerializedBytes(DEVICE_ID, MAX_PLAN_UTF8_BYTES, MAX_PLAN_REVISION);
    const over = growPlanByOneByte(exact);

    expect(getSerializedPlanByteLength(exact)).toBe(MAX_PLAN_UTF8_BYTES);
    expect(validatePlanDocument(exact).ok).toBe(true);
    expect(issueCodes(over)).toContain("plan_too_large");
    expect(() => parsePlanDocument(over)).toThrow(PlanConstraintError);
  });

  it("reserves enough bytes for a revision to grow without a later Repository-only failure", () => {
    const revisionGrowth = String(MAX_PLAN_REVISION).length - String(9).length;
    const sustainable = createPlanWithSerializedBytes(
      DEVICE_ID,
      MAX_PLAN_UTF8_BYTES - revisionGrowth,
      9,
    );
    const rawBoundary = createPlanWithSerializedBytes(DEVICE_ID, MAX_PLAN_UTF8_BYTES, 9);

    expect(validatePlanDocument(sustainable).ok).toBe(true);
    expect(issueCodes(rawBoundary)).toContain("plan_too_large");
  });

  it("accepts exact money limits and keeps the tax solver inside its supported range", () => {
    const bounded = structuredClone(createSamplePlan(DEVICE_ID));
    const goals = bounded.categories.flatMap((item) => item.goals);
    goals.forEach((item) => {
      item.monthlyAmountCents = 0;
    });
    goals[0].monthlyAmountCents = MAX_MONTHLY_GOAL_AMOUNT_CENTS;
    goals[1].monthlyAmountCents = MAX_MONTHLY_GOAL_TOTAL_CENTS - MAX_MONTHLY_GOAL_AMOUNT_CENTS;
    bounded.taxProfile.monthlyPretaxDeductionCents = MAX_MONTHLY_PRETAX_DEDUCTION_CENTS;
    bounded.taxProfile.bufferBasisPoints = 10_000;

    expect(validatePlanDocument(bounded).ok).toBe(true);
    expect(() => selectIncomeProjection(bounded)).not.toThrow();
  });

  it("rejects individual and aggregate amounts above their limits", () => {
    const excessiveGoal = structuredClone(createSamplePlan(DEVICE_ID));
    excessiveGoal.categories[0].goals[0].monthlyAmountCents = MAX_MONTHLY_GOAL_AMOUNT_CENTS + 1;
    expect(issueCodes(excessiveGoal)).toContain("goal_amount_too_large");

    const excessivePretax = structuredClone(createSamplePlan(DEVICE_ID));
    excessivePretax.taxProfile.monthlyPretaxDeductionCents = MAX_MONTHLY_PRETAX_DEDUCTION_CENTS + 1;
    expect(issueCodes(excessivePretax)).toContain("pretax_deduction_too_large");

    const excessiveTotal = structuredClone(createSamplePlan(DEVICE_ID));
    const goals = excessiveTotal.categories.flatMap((item) => item.goals);
    goals.forEach((item) => {
      item.monthlyAmountCents = 0;
    });
    goals[0].monthlyAmountCents = MAX_MONTHLY_GOAL_AMOUNT_CENTS;
    goals[1].monthlyAmountCents = MAX_MONTHLY_GOAL_AMOUNT_CENTS;
    goals[2].monthlyAmountCents = 1;
    expect(issueCodes(excessiveTotal)).toContain("goal_total_too_large");
  });

  it("accepts count boundaries and rejects each count beyond its limit", () => {
    const sample = createSamplePlan(DEVICE_ID);
    const categoryLimitPlan: PlanDocument = {
      ...sample,
      categories: Array.from({ length: MAX_PLAN_CATEGORIES }, (_, index) => category(index)),
    };
    expect(validatePlanDocument(categoryLimitPlan).ok).toBe(true);
    expect(
      issueCodes({
        ...categoryLimitPlan,
        categories: [...categoryLimitPlan.categories, category(MAX_PLAN_CATEGORIES)],
      }),
    ).toContain("too_many_categories");

    const perCategoryLimitPlan: PlanDocument = {
      ...sample,
      categories: [
        category(
          0,
          Array.from({ length: MAX_GOALS_PER_CATEGORY }, (_, index) => goal(index)),
        ),
      ],
    };
    expect(validatePlanDocument(perCategoryLimitPlan).ok).toBe(true);
    expect(
      issueCodes({
        ...perCategoryLimitPlan,
        categories: [
          category(
            0,
            Array.from({ length: MAX_GOALS_PER_CATEGORY + 1 }, (_, index) => goal(index)),
          ),
        ],
      }),
    ).toContain("too_many_goals_in_category");

    const allGoals = Array.from({ length: MAX_PLAN_GOALS + 1 }, (_, index) => goal(index));
    const totalLimitPlan = {
      ...sample,
      categories: [
        category(0, allGoals.slice(0, 167)),
        category(1, allGoals.slice(167, 334)),
        category(2, allGoals.slice(334)),
      ],
    };
    expect(issueCodes(totalLimitPlan)).toContain("too_many_goals");
  });
});
