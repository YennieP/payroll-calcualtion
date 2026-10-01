import type { PlanDocument } from "../domain/plan/types";

export type RemoteSaveResult =
  { status: "saved"; revision: number } | { status: "conflict"; remote: PlanDocument };

export interface RemotePlanRepository {
  load(accountId: string): Promise<PlanDocument | null>;
  push(
    accountId: string,
    plan: PlanDocument,
    expectedRemoteRevision: number,
  ): Promise<RemoteSaveResult>;
  subscribe(
    accountId: string,
    onRemoteChange: (plan: PlanDocument) => void,
    onError: (error: Error) => void,
  ): () => void;
  delete(accountId: string): Promise<void>;
}
