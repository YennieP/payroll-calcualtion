export interface PlanSyncState {
  accountId: string;
  remoteRevision: number;
  pendingRevision: number | null;
  pendingDelete: boolean;
}

export interface SyncStateStore {
  load(accountId: string): Promise<PlanSyncState | null>;
  save(state: PlanSyncState): Promise<void>;
  delete(accountId: string): Promise<void>;
}
