import { describe, expect, it } from "vitest";

import { DEFAULT_TAX_RULE_SET_ID } from "../tax/rules/us-ca-w2-2026";
import { migratePlanDocument, PlanMigrationError } from "./migrations";
import {
  selectCategorySubtotalCents,
  selectCategorySummaries,
  selectIncomeProjection,
  selectMonthlyBufferCents,
  selectMonthlyTargetTakeHomeCents,
  selectPinnedSubtotalCents,
  selectTotalMonthlyGoalCents,
} from "./selectors";
import type { PlanDocument } from "./types";
import { validatePlanDocument } from "./validation";

const plan: PlanDocument = {
  schemaVersion: 1,
  planId: "10000000-0000-4000-8000-000000000001",
  revision: 3,
  updatedAt: "2026-09-30T20:00:00.000Z",
  updatedByDevice: "10000000-0000-4000-8000-000000000002",
  taxProfile: {
    state: "CA",
    filingStatus: "single",
    monthlyPretaxDeductionCents: 50_000,
    bufferBasisPoints: 1_000,
    planningYear: 2026,
    taxRuleVersion: DEFAULT_TAX_RULE_SET_ID,
  },
  preferences: { themeId: "rouge" },
  categories: [
    {
      id: "10000000-0000-4000-8000-000000000003",
      name: "日常",
      icon: "◇",
      order: 0,
      goals: [
        {
          id: "10000000-0000-4000-8000-000000000004",
          name: "住房",
          monthlyAmountCents: 100_000,
          budgetMode: "monthly-fixed",
          pinned: true,
          order: 0,
        },
        {
          id: "10000000-0000-4000-8000-000000000005",
          name: "餐饮",
          monthlyAmountCents: 250_000,
          budgetMode: "monthly-variable",
          pinned: false,
          order: 1,
        },
      ],
    },
    {
      id: "10000000-0000-4000-8000-000000000006",
      name: "未来",
      icon: "✦",
      order: 1,
      goals: [
        {
          id: "10000000-0000-4000-8000-000000000007",
          name: "旅行",
          monthlyAmountCents: 150_000,
          budgetMode: "monthly-average",
          pinned: true,
          order: 0,
        },
      ],
    },
  ],
};

describe("plan selectors", () => {
  it("derives category, pinned, goal, and buffer totals from source inputs", () => {
    expect(selectCategorySubtotalCents(plan, plan.categories[0].id)).toBe(350_000);
    expect(selectPinnedSubtotalCents(plan)).toBe(250_000);
    expect(selectTotalMonthlyGoalCents(plan)).toBe(500_000);
    expect(selectMonthlyBufferCents(plan)).toBe(50_000);
    expect(selectMonthlyTargetTakeHomeCents(plan)).toBe(550_000);
    expect(selectCategorySummaries(plan)).toEqual([
      {
        categoryId: plan.categories[0].id,
        goalCount: 2,
        pinnedGoalCount: 1,
        subtotalCents: 350_000,
        pinnedSubtotalCents: 100_000,
      },
      {
        categoryId: plan.categories[1].id,
        goalCount: 1,
        pinnedGoalCount: 1,
        subtotalCents: 150_000,
        pinnedSubtotalCents: 150_000,
      },
    ]);
  });

  it("derives income without persisting or rounding away source cents", () => {
    const projection = selectIncomeProjection(plan);

    expect(projection.annualTargetTakeHomeCents).toBe(6_600_000);
    expect(projection.annualPretaxDeductionsCents).toBe(600_000);
    expect(projection.annualPay.takeHomeCents).toBeGreaterThanOrEqual(6_600_000);
    expect(Number.isInteger(projection.annualRequiredGrossCents)).toBe(true);
    expect(projection.monthlyRequiredGrossCents).toBe(
      Math.ceil(projection.annualRequiredGrossCents / 12),
    );
  });
});

describe("plan validation and migration", () => {
  it("accepts a valid versioned document", () => {
    expect(validatePlanDocument(plan)).toEqual({ ok: true, value: plan });
  });

  it("rejects duplicate IDs and fractional cents", () => {
    const invalid = {
      ...plan,
      categories: [
        {
          ...plan.categories[0],
          goals: [
            {
              ...plan.categories[0].goals[0],
              id: plan.planId,
              monthlyAmountCents: 1.5,
            },
          ],
        },
      ],
    };
    const result = validatePlanDocument(invalid);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining(["duplicate_uuid", "invalid_money"]),
      );
    }
  });

  it("rejects unknown nested fields and unregistered tax-rule versions", () => {
    const invalid = {
      ...plan,
      taxProfile: { ...plan.taxProfile, taxRuleVersion: "us-ca-w2-2099-v1", hidden: true },
      preferences: { ...plan.preferences, hidden: true },
      categories: [
        {
          ...plan.categories[0],
          hidden: true,
          goals: [{ ...plan.categories[0].goals[0], hidden: true }],
        },
      ],
    };
    const result = validatePlanDocument(invalid);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "taxProfile.hidden", code: "unexpected_field" }),
          expect.objectContaining({
            path: "taxProfile.taxRuleVersion",
            code: "invalid_tax_rule_version",
          }),
          expect.objectContaining({ path: "preferences.hidden", code: "unexpected_field" }),
          expect.objectContaining({ path: "categories[0].hidden", code: "unexpected_field" }),
          expect.objectContaining({
            path: "categories[0].goals[0].hidden",
            code: "unexpected_field",
          }),
        ]),
      );
    }
  });

  it("migrates version 0 while preserving IDs and source amounts", () => {
    const version0 = JSON.parse(JSON.stringify(plan)) as Record<string, unknown>;
    version0.schemaVersion = 0;
    const taxProfile = version0.taxProfile as Record<string, unknown>;
    delete taxProfile.planningYear;
    delete taxProfile.taxRuleVersion;

    const migrated = migratePlanDocument(version0);

    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.planId).toBe(plan.planId);
    expect(migrated.categories[0].goals[0].monthlyAmountCents).toBe(100_000);
    expect(migrated.taxProfile.planningYear).toBe(2026);
    expect(migrated.taxProfile.taxRuleVersion).toBe(DEFAULT_TAX_RULE_SET_ID);
  });

  it("fails closed for a future schema version", () => {
    expect(() => migratePlanDocument({ ...plan, schemaVersion: 99 })).toThrow(PlanMigrationError);
  });
});
