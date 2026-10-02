import { describe, expect, it } from "vitest";

import { createSamplePlan } from "../../application/samplePlan";
import {
  addCategory,
  addGoal,
  deleteCategory,
  deleteGoal,
  moveCategory,
  moveGoalToCategory,
  moveGoalWithinCategory,
  selectTheme,
  updateCategory,
  updateGoal,
  updateTaxProfile,
} from "./commands";
import { validatePlanDocument } from "./validation";
import { MAX_MONTHLY_GOAL_AMOUNT_CENTS, MAX_PLAN_CATEGORIES } from "./limits";
import { PlanConstraintError } from "./validation";

const DEVICE_ID = "30000000-0000-4000-8000-000000000001";
const metadata = {
  updatedAt: "2026-09-30T21:00:00.000Z",
  updatedByDevice: DEVICE_ID,
};

describe("plan commands", () => {
  it("adds, updates, reorders, moves, and deletes a goal without changing its ID", () => {
    const initial = createSamplePlan(DEVICE_ID);
    const sourceId = initial.categories[0].id;
    const targetId = initial.categories[1].id;
    const goalId = "30000000-0000-4000-8000-000000000099";

    const added = addGoal(
      initial,
      sourceId,
      {
        id: goalId,
        name: "新目标",
        monthlyAmountCents: 12_345,
        budgetMode: "monthly-fixed",
      },
      metadata,
    );
    const updated = updateGoal(
      added,
      sourceId,
      goalId,
      { name: "升级目标", pinned: true },
      metadata,
    );
    const reordered = moveGoalWithinCategory(updated, sourceId, goalId, -1, metadata);
    const moved = moveGoalToCategory(reordered, sourceId, goalId, targetId, metadata);

    expect(moved.categories[1].goals.at(-1)).toMatchObject({
      id: goalId,
      name: "升级目标",
      pinned: true,
      monthlyAmountCents: 12_345,
    });
    expect(moved.categories[0].goals.some((goal) => goal.id === goalId)).toBe(false);

    const removed = deleteGoal(moved, targetId, goalId, metadata);
    expect(removed.categories[1].goals.some((goal) => goal.id === goalId)).toBe(false);
    expect(validatePlanDocument(removed).ok).toBe(true);
  });

  it("manages categories while retaining at least one category", () => {
    const initial = createSamplePlan(DEVICE_ID);
    const categoryId = "30000000-0000-4000-8000-000000000098";
    const added = addCategory(initial, { id: categoryId, name: "新分类", icon: "Ⅶ" }, metadata);
    const renamed = updateCategory(added, categoryId, { name: "长期计划" }, metadata);
    const moved = moveCategory(renamed, categoryId, -1, metadata);
    const removed = deleteCategory(moved, categoryId, metadata);

    expect(renamed.categories.at(-1)?.name).toBe("长期计划");
    expect(moved.categories.at(-2)?.id).toBe(categoryId);
    expect(removed.categories).toHaveLength(initial.categories.length);
  });

  it("updates tax inputs and theme as source data", () => {
    const initial = createSamplePlan(DEVICE_ID);
    const withTax = updateTaxProfile(
      initial,
      { filingStatus: "married", monthlyPretaxDeductionCents: 75_050, bufferBasisPoints: 875 },
      metadata,
    );
    const themed = selectTheme(withTax, "violet-blue", metadata);

    expect(themed.taxProfile).toMatchObject({
      filingStatus: "married",
      monthlyPretaxDeductionCents: 75_050,
      bufferBasisPoints: 875,
    });
    expect(themed.preferences.themeId).toBe("violet-blue");
    expect(validatePlanDocument(themed).ok).toBe(true);
  });

  it("rejects a command that would create an out-of-contract plan", () => {
    const initial = createSamplePlan(DEVICE_ID);
    const category = initial.categories[0];
    const goal = category.goals[0];

    expect(() =>
      updateGoal(
        initial,
        category.id,
        goal.id,
        { monthlyAmountCents: MAX_MONTHLY_GOAL_AMOUNT_CENTS + 1 },
        metadata,
      ),
    ).toThrow(PlanConstraintError);
    expect(goal.monthlyAmountCents).not.toBe(MAX_MONTHLY_GOAL_AMOUNT_CENTS + 1);
  });

  it("rejects adding a category after the plan reaches its category limit", () => {
    const initial = createSamplePlan(DEVICE_ID);
    const full = {
      ...initial,
      categories: Array.from({ length: MAX_PLAN_CATEGORIES }, (_, index) => ({
        ...initial.categories[0],
        id: `43000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        name: `分类 ${index}`,
        order: index,
        goals: [],
      })),
    };

    expect(() =>
      addCategory(
        full,
        {
          id: "43000000-0000-4000-8000-999999999999",
          name: "超限分类",
          icon: "＋",
        },
        metadata,
      ),
    ).toThrow(PlanConstraintError);
  });
});
