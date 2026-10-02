import type { BudgetMode, Category, Goal, PlanDocument, TaxProfile, ThemeId } from "./types";
import { parsePlanDocument } from "./validation";

export interface MutationMetadata {
  updatedAt: string;
  updatedByDevice: string;
}

export interface NewCategoryInput {
  id: string;
  name: string;
  icon: string;
}

export interface NewGoalInput {
  id: string;
  name: string;
  monthlyAmountCents: number;
  budgetMode: BudgetMode;
  pinned?: boolean;
}

export type GoalChanges = Partial<
  Pick<Goal, "name" | "monthlyAmountCents" | "budgetMode" | "pinned">
>;

function touch(plan: PlanDocument, metadata: MutationMetadata): PlanDocument {
  return parsePlanDocument({
    ...plan,
    updatedAt: metadata.updatedAt,
    updatedByDevice: metadata.updatedByDevice,
  });
}

function reorder<T extends { order: number }>(items: T[]): T[] {
  return items.map((item, order) => ({ ...item, order }));
}

function updateCategoryById(
  plan: PlanDocument,
  categoryId: string,
  update: (category: Category) => Category,
  metadata: MutationMetadata,
): PlanDocument {
  let found = false;
  const categories = plan.categories.map((category) => {
    if (category.id !== categoryId) return category;
    found = true;
    return update(category);
  });
  return found ? touch({ ...plan, categories }, metadata) : plan;
}

export function addCategory(
  plan: PlanDocument,
  input: NewCategoryInput,
  metadata: MutationMetadata,
): PlanDocument {
  if (plan.categories.some((category) => category.id === input.id)) return plan;
  const category: Category = {
    id: input.id,
    name: input.name.trim() || "新分类",
    icon: input.icon.trim() || "＋",
    order: plan.categories.length,
    goals: [],
  };
  return touch({ ...plan, categories: [...plan.categories, category] }, metadata);
}

export function updateCategory(
  plan: PlanDocument,
  categoryId: string,
  changes: Partial<Pick<Category, "name" | "icon">>,
  metadata: MutationMetadata,
): PlanDocument {
  return updateCategoryById(
    plan,
    categoryId,
    (category) => ({
      ...category,
      name: changes.name?.trim() || category.name,
      icon: changes.icon?.trim() || category.icon,
    }),
    metadata,
  );
}

export function deleteCategory(
  plan: PlanDocument,
  categoryId: string,
  metadata: MutationMetadata,
): PlanDocument {
  const categories = plan.categories.filter((category) => category.id !== categoryId);
  if (categories.length === plan.categories.length || categories.length === 0) return plan;
  return touch({ ...plan, categories: reorder(categories) }, metadata);
}

export function moveCategory(
  plan: PlanDocument,
  categoryId: string,
  direction: -1 | 1,
  metadata: MutationMetadata,
): PlanDocument {
  const index = plan.categories.findIndex((category) => category.id === categoryId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= plan.categories.length) return plan;
  const categories = [...plan.categories];
  [categories[index], categories[targetIndex]] = [categories[targetIndex], categories[index]];
  return touch({ ...plan, categories: reorder(categories) }, metadata);
}

export function addGoal(
  plan: PlanDocument,
  categoryId: string,
  input: NewGoalInput,
  metadata: MutationMetadata,
): PlanDocument {
  if (plan.categories.some((category) => category.goals.some((goal) => goal.id === input.id))) {
    return plan;
  }
  return updateCategoryById(
    plan,
    categoryId,
    (category) => ({
      ...category,
      goals: [
        ...category.goals,
        {
          id: input.id,
          name: input.name.trim() || "新目标",
          monthlyAmountCents: Math.max(0, Math.round(input.monthlyAmountCents)),
          budgetMode: input.budgetMode,
          pinned: input.pinned ?? false,
          order: category.goals.length,
        },
      ],
    }),
    metadata,
  );
}

export function updateGoal(
  plan: PlanDocument,
  categoryId: string,
  goalId: string,
  changes: GoalChanges,
  metadata: MutationMetadata,
): PlanDocument {
  return updateCategoryById(
    plan,
    categoryId,
    (category) => {
      let found = false;
      const goals = category.goals.map((goal) => {
        if (goal.id !== goalId) return goal;
        found = true;
        return {
          ...goal,
          ...changes,
          name: changes.name?.trim() || goal.name,
          monthlyAmountCents:
            changes.monthlyAmountCents === undefined
              ? goal.monthlyAmountCents
              : Math.max(0, Math.round(changes.monthlyAmountCents)),
        };
      });
      return found ? { ...category, goals } : category;
    },
    metadata,
  );
}

export function deleteGoal(
  plan: PlanDocument,
  categoryId: string,
  goalId: string,
  metadata: MutationMetadata,
): PlanDocument {
  return updateCategoryById(
    plan,
    categoryId,
    (category) => {
      const goals = category.goals.filter((goal) => goal.id !== goalId);
      return goals.length === category.goals.length
        ? category
        : { ...category, goals: reorder(goals) };
    },
    metadata,
  );
}

export function moveGoalWithinCategory(
  plan: PlanDocument,
  categoryId: string,
  goalId: string,
  direction: -1 | 1,
  metadata: MutationMetadata,
): PlanDocument {
  return updateCategoryById(
    plan,
    categoryId,
    (category) => {
      const index = category.goals.findIndex((goal) => goal.id === goalId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= category.goals.length) return category;
      const goals = [...category.goals];
      [goals[index], goals[targetIndex]] = [goals[targetIndex], goals[index]];
      return { ...category, goals: reorder(goals) };
    },
    metadata,
  );
}

export function moveGoalToCategory(
  plan: PlanDocument,
  sourceCategoryId: string,
  goalId: string,
  targetCategoryId: string,
  metadata: MutationMetadata,
): PlanDocument {
  if (sourceCategoryId === targetCategoryId) return plan;
  const source = plan.categories.find((category) => category.id === sourceCategoryId);
  const target = plan.categories.find((category) => category.id === targetCategoryId);
  const goal = source?.goals.find((candidate) => candidate.id === goalId);
  if (!source || !target || !goal) return plan;

  const categories = plan.categories.map((category) => {
    if (category.id === sourceCategoryId) {
      return { ...category, goals: reorder(category.goals.filter((item) => item.id !== goalId)) };
    }
    if (category.id === targetCategoryId) {
      return { ...category, goals: reorder([...category.goals, goal]) };
    }
    return category;
  });
  return touch({ ...plan, categories }, metadata);
}

export function updateTaxProfile(
  plan: PlanDocument,
  changes: Partial<
    Pick<TaxProfile, "filingStatus" | "monthlyPretaxDeductionCents" | "bufferBasisPoints">
  >,
  metadata: MutationMetadata,
): PlanDocument {
  return touch(
    {
      ...plan,
      taxProfile: {
        ...plan.taxProfile,
        ...changes,
        monthlyPretaxDeductionCents:
          changes.monthlyPretaxDeductionCents === undefined
            ? plan.taxProfile.monthlyPretaxDeductionCents
            : Math.max(0, Math.round(changes.monthlyPretaxDeductionCents)),
        bufferBasisPoints:
          changes.bufferBasisPoints === undefined
            ? plan.taxProfile.bufferBasisPoints
            : Math.min(10_000, Math.max(0, Math.round(changes.bufferBasisPoints))),
      },
    },
    metadata,
  );
}

export function selectTheme(
  plan: PlanDocument,
  themeId: ThemeId,
  metadata: MutationMetadata,
): PlanDocument {
  return touch({ ...plan, preferences: { ...plan.preferences, themeId } }, metadata);
}
