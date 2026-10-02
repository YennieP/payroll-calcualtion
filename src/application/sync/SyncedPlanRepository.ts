import type { PlanDocument } from "../../domain/plan";
import type { LocalPlanSyncRepository, PlanSyncState } from "../../ports/LocalPlanSyncRepository";
import type { PlanChange, PlanRepository, SaveResult } from "../../ports/PlanRepository";
import type {
  RemotePlanRepository,
  RemotePlanSnapshot,
  RemotePlanTombstone,
} from "../../ports/RemotePlanRepository";

export type CloudSyncStatus =
  "connecting" | "syncing" | "synced" | "offline" | "error" | "conflict";

export interface CloudSyncSnapshot {
  status: CloudSyncStatus;
  error: string | null;
}

type SyncListener = (snapshot: CloudSyncSnapshot) => void;

function initialState(accountId: string): PlanSyncState {
  return {
    accountId,
    remoteRevision: 0,
    pendingRevision: null,
    pendingDelete: false,
  };
}

export class SyncedPlanRepository implements PlanRepository {
  private readonly syncListeners = new Set<SyncListener>();
  private readonly startupConflicts = new Map<string, PlanDocument>();
  private readonly flushTails = new Map<string, Promise<void>>();
  private syncSnapshot: CloudSyncSnapshot;

  constructor(
    private readonly local: LocalPlanSyncRepository,
    private readonly remote: RemotePlanRepository,
    private readonly isOnline: () => boolean,
  ) {
    this.syncSnapshot = {
      status: isOnline() ? "connecting" : "offline",
      error: null,
    };
  }

  private publish(status: CloudSyncStatus, error: string | null = null) {
    this.syncSnapshot = { status, error };
    this.syncListeners.forEach((listener) => listener(this.syncSnapshot));
  }

  private normalizeState(accountId: string, state: PlanSyncState | null): PlanSyncState {
    state ??= initialState(accountId);
    return state.pendingDelete && state.pendingRevision === null
      ? { ...state, pendingRevision: state.remoteRevision + 1 }
      : state;
  }

  private async readLocal(accountId: string): Promise<{
    plan: PlanDocument | null;
    state: PlanSyncState;
  }> {
    const snapshot = await this.local.loadPlanSync(accountId);
    return {
      plan: snapshot.plan,
      state: this.normalizeState(accountId, snapshot.syncState),
    };
  }

  subscribeSync(listener: SyncListener): () => void {
    this.syncListeners.add(listener);
    listener(this.syncSnapshot);
    return () => this.syncListeners.delete(listener);
  }

  async hasPendingChanges(accountId: string): Promise<boolean> {
    const { state } = await this.readLocal(accountId);
    return state.pendingRevision !== null || state.pendingDelete;
  }

  async load(accountId: string): Promise<PlanDocument | null> {
    const { plan: localPlan, state } = await this.readLocal(accountId);
    if (!this.isOnline()) {
      this.publish("offline");
      return localPlan;
    }

    if (state.pendingRevision !== null || state.pendingDelete) {
      const flushResult = await this.flush(accountId);
      if (flushResult.status === "conflict") {
        this.startupConflicts.set(accountId, flushResult.remote);
      }
      if (flushResult.status === "deleted") return null;
      return localPlan;
    }

    try {
      const remoteSnapshot = await this.remote.load(accountId);
      if (!remoteSnapshot) {
        this.publish("synced");
        return localPlan;
      }
      if (remoteSnapshot.kind === "deleted") {
        await this.applyRemoteTombstone(accountId, remoteSnapshot.tombstone);
        return null;
      }
      const remotePlan = remoteSnapshot.plan;
      await this.local.replacePlanAndSyncState(accountId, remotePlan, {
        accountId,
        remoteRevision: remotePlan.revision,
        pendingRevision: null,
        pendingDelete: false,
      });
      this.publish("synced");
      return remotePlan;
    } catch (error: unknown) {
      this.publish("error", error instanceof Error ? error.message : "Cloud load failed.");
      return localPlan;
    }
  }

  async importPlan(accountId: string, plan: PlanDocument): Promise<SaveResult> {
    const { state } = await this.readLocal(accountId);
    const imported = {
      ...plan,
      revision: Math.max(
        plan.revision,
        state.remoteRevision + 1,
        (state.pendingRevision ?? -1) + 1,
      ),
    };
    await this.local.replacePlanAndSyncState(accountId, imported, {
      ...state,
      pendingRevision: imported.revision,
      pendingDelete: false,
    });
    return this.flush(accountId);
  }

  async save(accountId: string, plan: PlanDocument, expectedRevision: number): Promise<SaveResult> {
    const { state } = await this.readLocal(accountId);
    const nextRevision = Math.max(
      expectedRevision + 1,
      state.remoteRevision + 1,
      (state.pendingRevision ?? -1) + 1,
    );
    const savedPlan = { ...plan, revision: nextRevision };
    const localResult = await this.local.savePlanAndSyncState(
      accountId,
      savedPlan,
      expectedRevision,
      {
        ...state,
        pendingRevision: savedPlan.revision,
        pendingDelete: false,
      },
    );
    if (localResult.status !== "saved") return localResult;

    if (!this.isOnline()) {
      this.publish("offline");
      return localResult;
    }
    this.publish("syncing");
    return localResult;
  }

  async replace(accountId: string, plan: PlanDocument): Promise<void> {
    await this.local.replace(accountId, plan);
  }

  async acceptRemote(accountId: string, remotePlan: PlanDocument): Promise<void> {
    this.startupConflicts.delete(accountId);
    await this.local.replacePlanAndSyncState(accountId, remotePlan, {
      accountId,
      remoteRevision: remotePlan.revision,
      pendingRevision: null,
      pendingDelete: false,
    });
    this.publish("synced");
  }

  async prepareLocalConflictResolution(
    accountId: string,
    localPlan: PlanDocument,
    remoteRevision: number,
  ): Promise<void> {
    this.startupConflicts.delete(accountId);
    await this.local.replacePlanAndSyncState(
      accountId,
      { ...localPlan, revision: remoteRevision },
      {
        accountId,
        remoteRevision,
        pendingRevision: null,
        pendingDelete: false,
      },
    );
  }

  async flush(accountId: string): Promise<SaveResult> {
    const previous = this.flushTails.get(accountId) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(() => this.flushPending(accountId));
    const tail = operation.then(
      () => undefined,
      () => undefined,
    );
    this.flushTails.set(accountId, tail);
    try {
      return await operation;
    } finally {
      if (this.flushTails.get(accountId) === tail) this.flushTails.delete(accountId);
    }
  }

  private async flushPending(accountId: string): Promise<SaveResult> {
    const { plan: localPlan, state } = await this.readLocal(accountId);
    if (!this.isOnline()) {
      this.publish("offline");
      return { status: "saved", revision: localPlan?.revision ?? state.remoteRevision };
    }

    this.publish("syncing");
    try {
      if (state.pendingDelete) {
        const tombstone: RemotePlanTombstone = {
          kind: "deleted",
          revision: state.pendingRevision ?? state.remoteRevision + 1,
          deletedAt: new Date().toISOString(),
        };
        const result = await this.remote.delete(accountId, tombstone);
        const acknowledged = await this.local.acknowledgeSync(
          accountId,
          result.revision,
          tombstone.revision,
        );
        this.publish(acknowledged.pendingRevision === null ? "synced" : "syncing");
        return { status: "deleted", revision: result.revision };
      }

      if (!localPlan || state.pendingRevision === null) {
        this.publish("synced");
        return { status: "saved", revision: localPlan?.revision ?? state.remoteRevision };
      }

      const result = await this.remote.push(accountId, localPlan, state.remoteRevision);
      if (result.status === "conflict") {
        if (result.remote.kind === "deleted") {
          await this.applyRemoteTombstone(accountId, result.remote.tombstone);
          return { status: "deleted", revision: result.remote.tombstone.revision };
        }
        this.publish("conflict");
        return { status: "conflict", remote: result.remote.plan };
      }
      const acknowledged = await this.local.acknowledgeSync(
        accountId,
        result.revision,
        localPlan.revision,
      );
      this.publish(acknowledged.pendingRevision === null ? "synced" : "syncing");
      return result;
    } catch (error: unknown) {
      this.publish("error", error instanceof Error ? error.message : "Cloud sync failed.");
      return { status: "saved", revision: localPlan?.revision ?? state.remoteRevision };
    }
  }

  subscribe(accountId: string, onRemoteChange: (plan: PlanChange) => void): () => void {
    const unsubscribeLocal = this.local.subscribe(accountId, onRemoteChange);
    const unsubscribeRemote = this.remote.subscribe(
      accountId,
      (remoteSnapshot) => {
        void this.handleRemoteSnapshot(accountId, remoteSnapshot, onRemoteChange);
      },
      (error) => this.publish("error", error.message),
    );
    const startupConflict = this.startupConflicts.get(accountId);
    if (startupConflict) {
      queueMicrotask(() => onRemoteChange(startupConflict));
    }
    return () => {
      unsubscribeLocal();
      unsubscribeRemote();
    };
  }

  private async handleRemoteSnapshot(
    accountId: string,
    remoteSnapshot: RemotePlanSnapshot,
    onRemoteChange: (plan: PlanChange) => void,
  ) {
    if (remoteSnapshot.kind === "deleted") {
      await this.applyRemoteTombstone(accountId, remoteSnapshot.tombstone);
      return;
    }
    await this.handleRemotePlan(accountId, remoteSnapshot.plan, onRemoteChange);
  }

  private async applyRemoteTombstone(accountId: string, tombstone: RemotePlanTombstone) {
    const { state } = await this.readLocal(accountId);
    if (tombstone.revision < state.remoteRevision) return;
    await this.local.deletePlanAndSyncState(accountId, {
      accountId,
      remoteRevision: tombstone.revision,
      pendingRevision: null,
      pendingDelete: false,
    });
    this.publish("synced");
  }

  private async handleRemotePlan(
    accountId: string,
    remotePlan: PlanDocument,
    onRemoteChange: (plan: PlanDocument) => void,
  ) {
    const { plan: localPlan, state } = await this.readLocal(accountId);
    if (state.pendingDelete) return;
    if (state.pendingRevision !== null) {
      const isOwnWriteEcho =
        localPlan !== null &&
        remotePlan.revision <= state.pendingRevision &&
        remotePlan.revision > state.remoteRevision &&
        remotePlan.updatedByDevice === localPlan.updatedByDevice &&
        (remotePlan.revision < localPlan.revision || remotePlan.updatedAt === localPlan.updatedAt);
      if (isOwnWriteEcho) {
        const acknowledged = await this.local.acknowledgeSync(
          accountId,
          remotePlan.revision,
          remotePlan.revision,
        );
        this.publish(acknowledged.pendingRevision === null ? "synced" : "syncing");
      } else if (remotePlan.revision !== state.remoteRevision) {
        this.publish("conflict");
        onRemoteChange(remotePlan);
      }
      return;
    }
    if (!localPlan || remotePlan.revision > localPlan.revision) {
      await this.local.replacePlanAndSyncState(accountId, remotePlan, {
        accountId,
        remoteRevision: remotePlan.revision,
        pendingRevision: null,
        pendingDelete: false,
      });
      this.publish("synced");
    }
  }

  async delete(accountId: string): Promise<void> {
    this.startupConflicts.delete(accountId);
    const { plan: localPlan, state } = await this.readLocal(accountId);
    const deletionRevision =
      Math.max(state.remoteRevision, state.pendingRevision ?? 0, localPlan?.revision ?? 0) + 1;
    await this.local.deletePlanAndSyncState(accountId, {
      ...state,
      pendingRevision: deletionRevision,
      pendingDelete: true,
    });
    if (this.isOnline()) await this.flush(accountId);
    else this.publish("offline");
  }
}
