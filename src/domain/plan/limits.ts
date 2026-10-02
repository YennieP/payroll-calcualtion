import type { PlanDocument } from "./types";

export const MAX_PLAN_CATEGORIES = 50;
export const MAX_GOALS_PER_CATEGORY = 200;
export const MAX_PLAN_GOALS = 500;
export const MAX_PLAN_UTF8_BYTES = 256 * 1024;
export const MAX_MONTHLY_GOAL_AMOUNT_CENTS = 50_000_000;
export const MAX_MONTHLY_PRETAX_DEDUCTION_CENTS = 50_000_000;
export const MAX_MONTHLY_GOAL_TOTAL_CENTS = 100_000_000;

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

export function serializePlanDocument(plan: PlanDocument): string {
  return JSON.stringify(plan);
}

export function getSerializedPlanByteLength(value: unknown): number {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? Number.POSITIVE_INFINITY : utf8ByteLength(serialized);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function countPlanGoals(plan: Pick<PlanDocument, "categories">): number {
  return plan.categories.reduce((total, category) => total + category.goals.length, 0);
}
