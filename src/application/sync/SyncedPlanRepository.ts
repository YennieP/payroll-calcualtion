import type { PlanDocument } from "../../domain/plan";
import type { PlanRepository, SaveResult } from "../../ports/PlanRepository";
import type { RemotePlanRepository } from "../../ports/RemotePlanRepository";
import type { PlanSyncState, SyncStateStore } from "../../ports/SyncStateStore";

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
  private syncSnapshot: CloudSyncSnapshot;

  constructor(
    private readonly local: PlanRepository,
    private readonly remote: RemotePlanRepository,
    private readonly syncStates: SyncStateStore,
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

  private async readState(accountId: string): Promise<PlanSyncState> {
    return (await this.syncStates.load(accountId)) ?? initialState(accountId);
  }

  subscribeSync(listener: SyncListener): () => void {
    this.syncListeners.add(listener);
    listener(this.syncSnapshot);
    return () => this.syncListeners.delete(listener);
  }

  async load(accountId: string): Promise<PlanDocument | null> {
    const localPlan = await this.local.load(accountId);
    if (!this.isOnline()) {
      this.publish("offline");
      return localPlan;
    }

    const state = await this.readState(accountId);
    if (localPlan && (state.pendingRevision !== null || state.pendingDelete)) {
      const flushResult = await this.flush(accountId);
      if (flushResult.status === "conflict") {
        this.startupConflicts.set(accountId, flushResult.remote);
      }
      return localPlan;
    }

    try {
      const remotePlan = await this.remote.load(accountId);
      if (!remotePlan) {
        this.publish("synced");
        return localPlan;
      }
      await this.local.replace(accountId, remotePlan);
      await this.syncStates.save({
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
    const state = await this.readState(accountId);
    const imported = {
      ...plan,
      revision: Math.max(plan.revision, state.remoteRevision + 1),
    };
    await this.local.replace(accountId, imported);
    await this.syncStates.save({
      ...state,
      pendingRevision: imported.revision,
      pendingDelete: false,
    });
    return this.flush(accountId);
  }

  async save(accountId: string, plan: PlanDocument, expectedRevision: number): Promise<SaveResult> {
    const localResult = await this.local.save(accountId, plan, expectedRevision);
    if (localResult.status === "conflict") return localResult;

    const savedPlan = { ...plan, revision: localResult.revision };
    const state = await this.readState(accountId);
    await this.syncStates.save({
      ...state,
      pendingRevision: savedPlan.revision,
      pendingDelete: false,
    });

    if (!this.isOnline()) {
      this.publish("offline");
      return localResult;
    }
    return this.flush(accountId);
  }

  async replace(accountId: string, plan: PlanDocument): Promise<void> {
    await this.local.replace(accountId, plan);
  }

  async acceptRemote(accountId: string, remotePlan: PlanDocument): Promise<void> {
    this.startupConflicts.delete(accountId);
    await this.local.replace(accountId, remotePlan);
    await this.syncStates.save({
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
    await this.local.replace(accountId, { ...localPlan, revision: remoteRevision });
    await this.syncStates.save({
      accountId,
      remoteRevision,
      pendingRevision: null,
      pendingDelete: false,
    });
  }

  async flush(accountId: string): Promise<SaveResult> {
    const state = await this.readState(accountId);
    if (!this.isOnline()) {
      this.publish("offline");
      const localPlan = await this.local.load(accountId);
      return { status: "saved", revision: localPlan?.revision ?? state.remoteRevision };
    }

    this.publish("syncing");
    try {
      if (state.pendingDelete) {
        await this.remote.delete(accountId);
        await this.syncStates.delete(accountId);
        this.publish("synced");
        return { status: "saved", revision: state.remoteRevision };
      }

      const localPlan = await this.local.load(accountId);
      if (!localPlan || state.pendingRevision === null) {
        this.publish("synced");
        return { status: "saved", revision: localPlan?.revision ?? state.remoteRevision };
      }

      const result = await this.remote.push(accountId, localPlan, state.remoteRevision);
      if (result.status === "conflict") {
        this.publish("conflict");
        return result;
      }
      await this.syncStates.save({
        accountId,
        remoteRevision: result.revision,
        pendingRevision: null,
        pendingDelete: false,
      });
      this.publish("synced");
      return result;
    } catch (error: unknown) {
      this.publish("error", error instanceof Error ? error.message : "Cloud sync failed.");
      const localPlan = await this.local.load(accountId);
      return { status: "saved", revision: localPlan?.revision ?? state.remoteRevision };
    }
  }

  subscribe(accountId: string, onRemoteChange: (plan: PlanDocument) => void): () => void {
    const unsubscribeLocal = this.local.subscribe(accountId, onRemoteChange);
    const unsubscribeRemote = this.remote.subscribe(
      accountId,
      (remotePlan) => {
        void this.handleRemotePlan(accountId, remotePlan, onRemoteChange);
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

  private async handleRemotePlan(
    accountId: string,
    remotePlan: PlanDocument,
    onRemoteChange: (plan: PlanDocument) => void,
  ) {
    const state = await this.readState(accountId);
    const localPlan = await this.local.load(accountId);
    if (state.pendingRevision !== null) {
      const isOwnWriteEcho =
        remotePlan.revision === state.pendingRevision &&
        localPlan !== null &&
        remotePlan.updatedByDevice === localPlan.updatedByDevice &&
        remotePlan.updatedAt === localPlan.updatedAt;
      if (isOwnWriteEcho) {
        await this.syncStates.save({
          accountId,
          remoteRevision: remotePlan.revision,
          pendingRevision: null,
          pendingDelete: false,
        });
        this.publish("synced");
      } else if (remotePlan.revision !== state.remoteRevision) {
        this.publish("conflict");
        onRemoteChange(remotePlan);
      }
      return;
    }
    if (!localPlan || remotePlan.revision > localPlan.revision) {
      await this.local.replace(accountId, remotePlan);
      await this.syncStates.save({
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
    const state = await this.readState(accountId);
    await this.local.delete(accountId);
    await this.syncStates.save({
      ...state,
      pendingRevision: null,
      pendingDelete: true,
    });
    if (this.isOnline()) await this.flush(accountId);
    else this.publish("offline");
  }
}
