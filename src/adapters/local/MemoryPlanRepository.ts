import { parsePlanDocument } from "../../domain/plan";
import type { PlanDocument } from "../../domain/plan";
import type {
  LocalPlanSyncRepository,
  LocalPlanSyncSnapshot,
  PlanSyncState,
} from "../../ports/LocalPlanSyncRepository";
import type { PlanChange, SaveResult } from "../../ports/PlanRepository";

interface MemoryPlanSyncEntry {
  plan: PlanDocument | null;
  syncState: PlanSyncState | null;
}

export class MemoryPlanRepository implements LocalPlanSyncRepository {
  private readonly entries = new Map<string, MemoryPlanSyncEntry>();
  private readonly subscribers = new Map<string, Set<(plan: PlanChange) => void>>();

  async loadPlanSync(accountId: string): Promise<LocalPlanSyncSnapshot> {
    const entry = this.entries.get(accountId);
    return {
      plan: entry?.plan ?? null,
      syncState: entry?.syncState ? { ...entry.syncState } : null,
    };
  }

  async load(accountId: string): Promise<PlanDocument | null> {
    return this.entries.get(accountId)?.plan ?? null;
  }

  async save(accountId: string, plan: PlanDocument, expectedRevision: number): Promise<SaveResult> {
    const current = this.entries.get(accountId);
    if ((current?.plan?.revision ?? 0) !== expectedRevision) {
      if (!current?.plan) throw new Error("Memory revision conflict has no local plan.");
      return { status: "conflict", remote: current.plan };
    }
    const savedPlan = parsePlanDocument({ ...plan, revision: expectedRevision + 1 });
    this.entries.set(accountId, {
      plan: savedPlan,
      syncState: current?.syncState ?? null,
    });
    this.notify(accountId, savedPlan);
    return { status: "saved", revision: savedPlan.revision };
  }

  async savePlanAndSyncState(
    accountId: string,
    plan: PlanDocument,
    expectedPlanRevision: number,
    syncState: PlanSyncState,
  ): Promise<SaveResult> {
    parsePlanDocument(plan);
    const current = this.entries.get(accountId);
    if ((current?.plan?.revision ?? 0) !== expectedPlanRevision) {
      if (!current?.plan) throw new Error("Memory revision conflict has no local plan.");
      return { status: "conflict", remote: current.plan };
    }
    this.entries.set(accountId, { plan, syncState: { ...syncState } });
    this.notify(accountId, plan);
    return { status: "saved", revision: plan.revision };
  }

  async replace(accountId: string, plan: PlanDocument): Promise<void> {
    parsePlanDocument(plan);
    const current = this.entries.get(accountId);
    this.entries.set(accountId, {
      plan,
      syncState: current?.syncState ?? null,
    });
    this.notify(accountId, plan);
  }

  async replacePlanAndSyncState(
    accountId: string,
    plan: PlanDocument,
    syncState: PlanSyncState,
  ): Promise<void> {
    parsePlanDocument(plan);
    this.entries.set(accountId, { plan, syncState: { ...syncState } });
    this.notify(accountId, plan);
  }

  subscribe(accountId: string, onRemoteChange: (plan: PlanChange) => void): () => void {
    const listeners = this.subscribers.get(accountId) ?? new Set();
    listeners.add(onRemoteChange);
    this.subscribers.set(accountId, listeners);
    return () => listeners.delete(onRemoteChange);
  }

  async delete(accountId: string): Promise<void> {
    this.entries.delete(accountId);
    this.notify(accountId, null);
  }

  async deletePlanAndSyncState(accountId: string, syncState: PlanSyncState): Promise<void> {
    this.entries.set(accountId, { plan: null, syncState: { ...syncState } });
    this.notify(accountId, null);
  }

  async acknowledgeSync(
    accountId: string,
    remoteRevision: number,
    acknowledgedPendingRevision: number,
  ): Promise<PlanSyncState> {
    const current = this.entries.get(accountId);
    const currentState = current?.syncState ?? {
      accountId,
      remoteRevision: 0,
      pendingRevision: null,
      pendingDelete: false,
    };
    const clearsPending = currentState.pendingRevision === acknowledgedPendingRevision;
    const syncState = {
      ...currentState,
      remoteRevision: Math.max(currentState.remoteRevision, remoteRevision),
      pendingRevision: clearsPending ? null : currentState.pendingRevision,
      pendingDelete: clearsPending ? false : currentState.pendingDelete,
    };
    this.entries.set(accountId, {
      plan: current?.plan ?? null,
      syncState: { ...syncState },
    });
    return syncState;
  }

  private notify(accountId: string, plan: PlanChange) {
    this.subscribers.get(accountId)?.forEach((listener) => listener(plan));
  }
}
