import type { PlanDocument } from "../domain/plan/types";

export type SaveResult =
  { status: "saved"; revision: number } | { status: "conflict"; remote: PlanDocument };

export interface PlanRepository {
  load(accountId: string): Promise<PlanDocument | null>;
  save(accountId: string, plan: PlanDocument, expectedRevision: number): Promise<SaveResult>;
  replace(accountId: string, plan: PlanDocument): Promise<void>;
  subscribe(accountId: string, onRemoteChange: (plan: PlanDocument) => void): () => void;
  delete(accountId: string): Promise<void>;
}
