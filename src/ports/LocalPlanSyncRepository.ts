import type { PlanDocument } from "../domain/plan/types";
import type { PlanRepository, SaveResult } from "./PlanRepository";

export interface PlanSyncState {
  accountId: string;
  remoteRevision: number;
  pendingRevision: number | null;
  pendingDelete: boolean;
}

export interface LocalPlanSyncSnapshot {
  plan: PlanDocument | null;
  syncState: PlanSyncState | null;
}

export type LocalPlanSyncCommitKind =
  "save-plan" | "replace-plan" | "delete-plan" | "save-sync-state";

export interface LocalPlanSyncRepository extends PlanRepository {
  loadPlanSync(accountId: string): Promise<LocalPlanSyncSnapshot>;
  savePlanAndSyncState(
    accountId: string,
    plan: PlanDocument,
    expectedPlanRevision: number,
    syncState: PlanSyncState,
  ): Promise<SaveResult>;
  replacePlanAndSyncState(
    accountId: string,
    plan: PlanDocument,
    syncState: PlanSyncState,
  ): Promise<void>;
  deletePlanAndSyncState(accountId: string, syncState: PlanSyncState): Promise<void>;
  acknowledgeSync(
    accountId: string,
    remoteRevision: number,
    acknowledgedPendingRevision: number,
  ): Promise<PlanSyncState>;
}
