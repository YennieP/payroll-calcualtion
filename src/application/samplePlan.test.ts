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
});
