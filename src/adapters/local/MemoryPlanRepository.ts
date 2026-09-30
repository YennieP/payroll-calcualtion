import { parsePlanDocument } from "../../domain/plan";
import type { PlanDocument } from "../../domain/plan";
import type { PlanRepository, SaveResult } from "../../ports/PlanRepository";

export class MemoryPlanRepository implements PlanRepository {
  private readonly plans = new Map<string, PlanDocument>();
  private readonly subscribers = new Map<string, Set<(plan: PlanDocument) => void>>();

  async load(accountId: string): Promise<PlanDocument | null> {
    return this.plans.get(accountId) ?? null;
  }

  async save(accountId: string, plan: PlanDocument, expectedRevision: number): Promise<SaveResult> {
    parsePlanDocument(plan);
    const current = this.plans.get(accountId);
    if ((current?.revision ?? 0) !== expectedRevision) {
      if (!current) throw new Error("Memory revision conflict has no remote plan.");
      return { status: "conflict", remote: current };
    }
    const savedPlan = { ...plan, revision: expectedRevision + 1 };
    this.plans.set(accountId, savedPlan);
    this.subscribers.get(accountId)?.forEach((listener) => listener(savedPlan));
    return { status: "saved", revision: savedPlan.revision };
  }

  subscribe(accountId: string, onRemoteChange: (plan: PlanDocument) => void): () => void {
    const listeners = this.subscribers.get(accountId) ?? new Set();
    listeners.add(onRemoteChange);
    this.subscribers.set(accountId, listeners);
    return () => listeners.delete(onRemoteChange);
  }

  async delete(accountId: string): Promise<void> {
    this.plans.delete(accountId);
  }
}
