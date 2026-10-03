import { doc, getDoc, onSnapshot, runTransaction, type Firestore } from "firebase/firestore";

import { migratePlanDocument, parsePlanDocument } from "../../domain/plan";
import type { PlanDocument } from "../../domain/plan";
import type {
  RemoteDeleteResult,
  RemotePlanRepository,
  RemotePlanSnapshot,
  RemotePlanTombstone,
  RemoteSaveResult,
} from "../../ports/RemotePlanRepository";
import { RemotePlanReadError } from "../../ports/RemotePlanRepository";

function readTombstone(value: Record<string, unknown>): RemotePlanTombstone {
  const keys = Object.keys(value);
  if (
    keys.length !== 3 ||
    !keys.includes("kind") ||
    !keys.includes("revision") ||
    !keys.includes("deletedAt") ||
    value.kind !== "deleted" ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) <= 0 ||
    typeof value.deletedAt !== "string" ||
    !Number.isFinite(Date.parse(value.deletedAt))
  ) {
    throw new Error("The remote deletion tombstone is invalid.");
  }
  return value as unknown as RemotePlanTombstone;
}

function readRemoteSnapshot(value: unknown): RemotePlanSnapshot {
  if (typeof value === "object" && value !== null && !Array.isArray(value) && "kind" in value) {
    return { kind: "deleted", tombstone: readTombstone(value as Record<string, unknown>) };
  }
  return { kind: "plan", plan: migratePlanDocument(value) };
}

function recoveryJson(value: unknown): string | null {
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    return null;
  }
}

function corruptRemoteData(error: unknown, value?: unknown): RemotePlanReadError {
  if (error instanceof RemotePlanReadError) return error;
  return new RemotePlanReadError("corrupt", "云端计划的数据结构不兼容或已损坏，已停止自动载入。", {
    cause: error,
    recoveryJson: recoveryJson(value),
  });
}

function unavailableRemoteData(error: unknown): RemotePlanReadError {
  if (error instanceof RemotePlanReadError) return error;
  return new RemotePlanReadError("unavailable", "云端计划暂时无法读取，请检查网络后重试。", {
    cause: error,
  });
}

function parseRemoteSnapshot(value: unknown): RemotePlanSnapshot {
  try {
    return readRemoteSnapshot(value);
  } catch (error: unknown) {
    throw corruptRemoteData(error, value);
  }
}

function snapshotRevision(snapshot: RemotePlanSnapshot | null): number {
  if (!snapshot) return 0;
  return snapshot.kind === "plan" ? snapshot.plan.revision : snapshot.tombstone.revision;
}

export class FirebasePlanRepository implements RemotePlanRepository {
  constructor(private readonly firestore: Firestore) {}

  private reference(accountId: string) {
    return doc(this.firestore, "plans", accountId);
  }

  async load(accountId: string): Promise<RemotePlanSnapshot | null> {
    let snapshot;
    try {
      snapshot = await getDoc(this.reference(accountId));
    } catch (error: unknown) {
      throw unavailableRemoteData(error);
    }
    return snapshot.exists() ? parseRemoteSnapshot(snapshot.data()) : null;
  }

  async push(
    accountId: string,
    plan: PlanDocument,
    expectedRemoteRevision: number,
  ): Promise<RemoteSaveResult> {
    parsePlanDocument(plan);
    if (plan.revision <= expectedRemoteRevision) {
      throw new Error("A remote push must advance the plan revision.");
    }

    return runTransaction(this.firestore, async (transaction) => {
      const reference = this.reference(accountId);
      const snapshot = await transaction.get(reference);
      const remote = snapshot.exists() ? parseRemoteSnapshot(snapshot.data()) : null;
      const actualRevision = snapshotRevision(remote);
      if (actualRevision !== expectedRemoteRevision) {
        if (!remote) throw new Error("Remote revision conflict has no plan document.");
        return { status: "conflict", remote } as const;
      }
      transaction.set(reference, { ...plan });
      return { status: "saved", revision: plan.revision } as const;
    });
  }

  subscribe(
    accountId: string,
    onRemoteChange: (snapshot: RemotePlanSnapshot) => void,
    onError: (error: RemotePlanReadError) => void,
  ): () => void {
    return onSnapshot(
      this.reference(accountId),
      (snapshot) => {
        if (!snapshot.exists()) return;
        let remoteSnapshot: RemotePlanSnapshot;
        try {
          remoteSnapshot = parseRemoteSnapshot(snapshot.data());
        } catch (error: unknown) {
          onError(corruptRemoteData(error));
          return;
        }
        onRemoteChange(remoteSnapshot);
      },
      (error) => onError(unavailableRemoteData(error)),
    );
  }

  async delete(
    accountId: string,
    requestedTombstone: RemotePlanTombstone,
  ): Promise<RemoteDeleteResult> {
    const tombstone = readTombstone(requestedTombstone as unknown as Record<string, unknown>);
    return runTransaction(this.firestore, async (transaction) => {
      const reference = this.reference(accountId);
      const snapshot = await transaction.get(reference);
      const remote = snapshot.exists() ? parseRemoteSnapshot(snapshot.data()) : null;
      const revision = Math.max(tombstone.revision, snapshotRevision(remote) + 1);
      transaction.set(reference, { ...tombstone, revision });
      return { revision };
    });
  }
}
