import { describe, expect, it } from "vitest";

import {
  selectPinnedSubtotalCents,
  selectTotalMonthlyGoalCents,
  validatePlanDocument,
} from "../domain/plan";
import { createSamplePlan } from "./samplePlan";

describe("sample plan", () => {
  it("contains the accepted 50-goal information architecture and totals", () => {
    const plan = createSamplePlan("30000000-0000-4000-8000-000000000001");
    const goalCount = plan.categories.reduce((total, category) => total + category.goals.length, 0);

    expect(plan.categories).toHaveLength(6);
    expect(goalCount).toBe(50);
    expect(selectTotalMonthlyGoalCents(plan)).toBe(1_090_000);
    expect(selectPinnedSubtotalCents(plan)).toBe(532_000);
    expect(validatePlanDocument(plan).ok).toBe(true);
  });

  it("keeps an extreme-length 50-goal document below the Phase 7 storage budget", () => {
    const longName = "跨城市家庭照护旅行学习医疗储蓄与长期生活升级计划".repeat(6).slice(0, 120);
    const plan = createSamplePlan("30000000-0000-4000-8000-000000000001");
    const extreme = {
      ...plan,
      categories: plan.categories.map((category) => ({
        ...category,
        name: longName,
        goals: category.goals.map((goal) => ({ ...goal, name: longName })),
      })),
    };

    expect(validatePlanDocument(extreme).ok).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(extreme)).byteLength).toBeLessThanOrEqual(
      128 * 1024,
    );
  });
});
