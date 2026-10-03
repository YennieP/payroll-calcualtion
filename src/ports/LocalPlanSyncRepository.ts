import type { PlanDocument } from "../domain/plan/types";
import type { PlanRepository, SaveResult } from "./PlanRepository";

export class LocalPlanRecoveryError extends Error {
  constructor(
    readonly recoveryJson: string,
    options?: { cause?: unknown },
  ) {
    super("本机保存的是旧版或不兼容计划。请先导出原始 JSON，再清理此设备副本。", options);
    this.name = "LocalPlanRecoveryError";
  }
}

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
