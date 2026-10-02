import { createSamplePlan } from "../application/samplePlan";
import { getSerializedPlanByteLength } from "../domain/plan/limits";
import type { Category, Goal, PlanDocument } from "../domain/plan/types";

function fixtureUuid(prefix: string, sequence: number): string {
  return `${prefix}000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

function appendExactUtf8Bytes(value: string, bytes: number): string {
  const threeByteCharacters = Math.floor(bytes / 3);
  const remainder = bytes % 3;
  return `${value}${"界".repeat(threeByteCharacters)}${remainder === 2 ? "¢" : remainder === 1 ? "x" : ""}`;
}

export function createPlanWithSerializedBytes(
  deviceId: string,
  targetBytes: number,
  revision = 0,
): PlanDocument {
  let goalSequence = 0;
  const categories: Category[] = Array.from({ length: 50 }, (_, categoryIndex) => ({
    id: fixtureUuid("41", categoryIndex),
    name: "a",
    icon: "a",
    order: categoryIndex,
    goals: Array.from({ length: 10 }, (_, goalIndex): Goal => {
      const sequence = goalSequence++;
      return {
        id: fixtureUuid("42", sequence),
        name: "a",
        monthlyAmountCents: 0,
        budgetMode: "monthly-fixed",
        pinned: false,
        order: goalIndex,
      };
    }),
  }));
  const plan: PlanDocument = {
    ...createSamplePlan(deviceId),
    revision,
    categories,
  };
  let remaining = targetBytes - getSerializedPlanByteLength(plan);
  if (remaining < 0) throw new Error("Target byte size is smaller than the valid fixture.");

  const namedItems = [...categories.flatMap((category) => category.goals), ...categories];
  for (const item of namedItems) {
    if (remaining === 0) break;
    const availableCharacters = 120 - item.name.length;
    const addedBytes = Math.min(remaining, availableCharacters * 3);
    item.name = appendExactUtf8Bytes(item.name, addedBytes);
    remaining -= addedBytes;
  }
  if (remaining !== 0) throw new Error("Target byte size exceeds the valid fixture capacity.");
  return plan;
}

export function growPlanByOneByte(plan: PlanDocument): PlanDocument {
  const grown = structuredClone(plan);
  const item = [
    ...grown.categories.flatMap((category) => category.goals),
    ...grown.categories,
  ].find((candidate) => candidate.name.length < 120);
  if (!item) throw new Error("Fixture has no valid one-byte growth slot.");
  item.name += "x";
  return grown;
}
