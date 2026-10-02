import { describe, expect, it } from "vitest";

import { createSamplePlan } from "../application/samplePlan";
import { appReducer, createInitialAppState } from "./appReducer";
import { MAX_MONTHLY_GOAL_AMOUNT_CENTS } from "../domain/plan";

const DEVICE_ID = "30000000-0000-4000-8000-000000000001";

describe("appReducer persistence state", () => {
  it("queues a new local save when the user keeps their side of a conflict", () => {
    const plan = { ...createSamplePlan(DEVICE_ID), revision: 2 };
    const remote = { ...createSamplePlan("other-device"), revision: 3 };
    const conflicted = appReducer(createInitialAppState(plan, DEVICE_ID), {
      type: "save-conflicted",
      remote,
    });

    const kept = appReducer(conflicted, { type: "local-kept" });

    expect(kept).toMatchObject({
      plan: { revision: 3 },
      conflictingPlan: null,
      saveStatus: "local-change",
      editSequence: 1,
    });
  });

  it("retains the last valid plan and exposes a recoverable constraint error", () => {
    const plan = createSamplePlan(DEVICE_ID);
    const category = plan.categories[0];
    const goal = category.goals[0];
    const initial = createInitialAppState(plan, DEVICE_ID);

    const rejected = appReducer(initial, {
      type: "goal-updated",
      categoryId: category.id,
      goalId: goal.id,
      changes: { monthlyAmountCents: MAX_MONTHLY_GOAL_AMOUNT_CENTS + 1 },
      metadata: { updatedAt: "2026-10-02T22:00:00.000Z", updatedByDevice: DEVICE_ID },
    });

    expect(rejected.plan).toBe(plan);
    expect(rejected.constraintError).toBe("单个目标的每月金额不能超过 $500,000。");
    expect(rejected.constraintSequence).toBe(1);
    expect(appReducer(rejected, { type: "constraint-dismissed" }).constraintError).toBeNull();
  });
});
