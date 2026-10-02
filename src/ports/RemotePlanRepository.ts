import type { PlanDocument } from "../domain/plan/types";

export type RemotePlanReadErrorKind = "unavailable" | "corrupt";

export class RemotePlanReadError extends Error {
  constructor(
    readonly kind: RemotePlanReadErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "RemotePlanReadError";
  }
}

export interface RemotePlanTombstone {
  kind: "deleted";
  revision: number;
  deletedAt: string;
}

export type RemotePlanSnapshot =
  { kind: "plan"; plan: PlanDocument } | { kind: "deleted"; tombstone: RemotePlanTombstone };

export type RemoteSaveResult =
  { status: "saved"; revision: number } | { status: "conflict"; remote: RemotePlanSnapshot };

export interface RemoteDeleteResult {
  revision: number;
}

export interface RemotePlanRepository {
  load(accountId: string): Promise<RemotePlanSnapshot | null>;
  push(
    accountId: string,
    plan: PlanDocument,
    expectedRemoteRevision: number,
  ): Promise<RemoteSaveResult>;
  subscribe(
    accountId: string,
    onRemoteChange: (snapshot: RemotePlanSnapshot) => void,
    onError: (error: RemotePlanReadError) => void,
  ): () => void;
  delete(accountId: string, tombstone: RemotePlanTombstone): Promise<RemoteDeleteResult>;
}
