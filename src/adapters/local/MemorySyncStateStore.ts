import type { PlanSyncState, SyncStateStore } from "../../ports/SyncStateStore";

export class MemorySyncStateStore implements SyncStateStore {
  private readonly states = new Map<string, PlanSyncState>();

  async load(accountId: string): Promise<PlanSyncState | null> {
    return this.states.get(accountId) ?? null;
  }

  async save(state: PlanSyncState): Promise<void> {
    this.states.set(state.accountId, { ...state });
  }

  async delete(accountId: string): Promise<void> {
    this.states.delete(accountId);
  }
}
