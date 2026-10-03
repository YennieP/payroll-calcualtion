import { migratePlanDocument, parsePlanDocument } from "../../domain/plan";
import type { PlanDocument } from "../../domain/plan";
import type {
  LocalPlanSyncCommitKind,
  LocalPlanSyncRepository,
  LocalPlanSyncSnapshot,
  PlanSyncState,
} from "../../ports/LocalPlanSyncRepository";
import { LocalPlanRecoveryError } from "../../ports/LocalPlanSyncRepository";
import type { PlanChange, SaveResult } from "../../ports/PlanRepository";

const DEFAULT_DATABASE_NAME = "worthwhile-plans";
const LEGACY_SYNC_DATABASE_NAME = "worthwhile-sync";
const DATABASE_VERSION = 2;
const PLAN_STORE = "plans";
const META_STORE = "metadata";
const LEGACY_SYNC_STORE = "sync-state";
const LEGACY_SYNC_MIGRATION_KEY = "legacy-sync-v1-imported";

interface StoredPlanSync {
  accountId: string;
  plan: PlanDocument | null;
  syncState?: PlanSyncState;
}

interface StoredMetadata {
  key: string;
  completed: boolean;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("IndexedDB request failed.")),
      { once: true },
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener(
      "abort",
      () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted.")),
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () => reject(transaction.error ?? new Error("IndexedDB transaction failed.")),
      { once: true },
    );
  });
}

function normalizeStored(stored: StoredPlanSync | undefined): LocalPlanSyncSnapshot {
  let plan: PlanDocument | null = null;
  if (stored?.plan) {
    try {
      plan = migratePlanDocument(stored.plan);
    } catch (error: unknown) {
      const recoveryJson = JSON.stringify(stored.plan);
      if (typeof recoveryJson !== "string") throw error;
      throw new LocalPlanRecoveryError(recoveryJson, { cause: error });
    }
  }
  return {
    plan,
    syncState: stored?.syncState ? { ...stored.syncState } : null,
  };
}

function assertSyncState(accountId: string, state: PlanSyncState) {
  if (
    state.accountId !== accountId ||
    !Number.isSafeInteger(state.remoteRevision) ||
    state.remoteRevision < 0 ||
    (state.pendingRevision !== null &&
      (!Number.isSafeInteger(state.pendingRevision) || state.pendingRevision < 0)) ||
    typeof state.pendingDelete !== "boolean"
  ) {
    throw new Error("The local plan sync state is invalid.");
  }
}

export class LocalPlanRepository implements LocalPlanSyncRepository {
  private readonly subscribers = new Map<string, Set<(plan: PlanChange) => void>>();
  private ready: Promise<void> | null = null;

  constructor(
    private readonly factory: IDBFactory = globalThis.indexedDB,
    private readonly databaseName = DEFAULT_DATABASE_NAME,
    private readonly legacySyncDatabaseName = LEGACY_SYNC_DATABASE_NAME,
  ) {
    if (!factory) throw new Error("IndexedDB is not available in this browser.");
  }

  protected beforeCommit(kind: LocalPlanSyncCommitKind): void {
    void kind;
  }

  private async openPrimaryDatabase(): Promise<IDBDatabase> {
    const request = this.factory.open(this.databaseName, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(PLAN_STORE)) {
        request.result.createObjectStore(PLAN_STORE, { keyPath: "accountId" });
      }
      if (!request.result.objectStoreNames.contains(META_STORE)) {
        request.result.createObjectStore(META_STORE, { keyPath: "key" });
      }
    });
    return requestResult(request);
  }

  private async readLegacySyncStates(): Promise<PlanSyncState[]> {
    if (this.legacySyncDatabaseName === this.databaseName) return [];
    const request = this.factory.open(this.legacySyncDatabaseName);
    const database = await requestResult(request);
    try {
      if (!database.objectStoreNames.contains(LEGACY_SYNC_STORE)) return [];
      const transaction = database.transaction(LEGACY_SYNC_STORE, "readonly");
      const states = await requestResult(
        transaction.objectStore(LEGACY_SYNC_STORE).getAll() as IDBRequest<PlanSyncState[]>,
      );
      await transactionComplete(transaction);
      return states;
    } finally {
      database.close();
    }
  }

  private async migrateLegacySyncStates(): Promise<void> {
    const database = await this.openPrimaryDatabase();
    try {
      const markerTransaction = database.transaction(META_STORE, "readonly");
      const marker = await requestResult(
        markerTransaction.objectStore(META_STORE).get(LEGACY_SYNC_MIGRATION_KEY) as IDBRequest<
          StoredMetadata | undefined
        >,
      );
      await transactionComplete(markerTransaction);
      if (marker?.completed) return;

      const legacyStates = await this.readLegacySyncStates();
      const transaction = database.transaction([PLAN_STORE, META_STORE], "readwrite");
      const completion = transactionComplete(transaction);
      const plans = transaction.objectStore(PLAN_STORE);
      try {
        for (const state of legacyStates) {
          assertSyncState(state.accountId, state);
          const stored = await requestResult(
            plans.get(state.accountId) as IDBRequest<StoredPlanSync | undefined>,
          );
          if (!stored?.syncState) {
            await requestResult(
              plans.put({
                accountId: state.accountId,
                plan: stored?.plan ?? null,
                syncState: { ...state },
              } as StoredPlanSync),
            );
          }
        }
        await requestResult(
          transaction.objectStore(META_STORE).put({
            key: LEGACY_SYNC_MIGRATION_KEY,
            completed: true,
          } as StoredMetadata),
        );
        await completion;
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have aborted because of the failed request.
        }
        await completion.catch(() => undefined);
        throw error;
      }
    } finally {
      database.close();
    }
  }

  private async ensureReady(): Promise<void> {
    this.ready ??= this.migrateLegacySyncStates();
    return this.ready;
  }

  private async openDatabase(): Promise<IDBDatabase> {
    await this.ensureReady();
    return this.openPrimaryDatabase();
  }

  private async commit(
    transaction: IDBTransaction,
    completion: Promise<void>,
    kind: LocalPlanSyncCommitKind,
  ): Promise<void> {
    try {
      this.beforeCommit(kind);
      await completion;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already have committed or aborted.
      }
      await completion.catch(() => undefined);
      throw error;
    }
  }

  async loadPlanSync(accountId: string): Promise<LocalPlanSyncSnapshot> {
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(PLAN_STORE, "readonly");
      const stored = await requestResult(
        transaction.objectStore(PLAN_STORE).get(accountId) as IDBRequest<
          StoredPlanSync | undefined
        >,
      );
      await transactionComplete(transaction);
      return normalizeStored(stored);
    } finally {
      database.close();
    }
  }

  async load(accountId: string): Promise<PlanDocument | null> {
    return (await this.loadPlanSync(accountId)).plan;
  }

  async save(accountId: string, plan: PlanDocument, expectedRevision: number): Promise<SaveResult> {
    const savedPlan = parsePlanDocument({ ...plan, revision: expectedRevision + 1 });
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(PLAN_STORE, "readwrite");
      const completion = transactionComplete(transaction);
      const store = transaction.objectStore(PLAN_STORE);
      const stored = await requestResult(
        store.get(accountId) as IDBRequest<StoredPlanSync | undefined>,
      );
      const current = normalizeStored(stored);
      if ((current.plan?.revision ?? 0) !== expectedRevision) {
        await completion;
        if (!current.plan) throw new Error("IndexedDB revision conflict has no local plan.");
        return { status: "conflict", remote: current.plan };
      }
      await requestResult(
        store.put({ accountId, plan: savedPlan, syncState: stored?.syncState } as StoredPlanSync),
      );
      await this.commit(transaction, completion, "save-plan");
      this.notify(accountId, savedPlan);
      return { status: "saved", revision: savedPlan.revision };
    } finally {
      database.close();
    }
  }

  async savePlanAndSyncState(
    accountId: string,
    plan: PlanDocument,
    expectedPlanRevision: number,
    syncState: PlanSyncState,
  ): Promise<SaveResult> {
    parsePlanDocument(plan);
    assertSyncState(accountId, syncState);
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(PLAN_STORE, "readwrite");
      const completion = transactionComplete(transaction);
      const store = transaction.objectStore(PLAN_STORE);
      const stored = await requestResult(
        store.get(accountId) as IDBRequest<StoredPlanSync | undefined>,
      );
      const current = normalizeStored(stored);
      if ((current.plan?.revision ?? 0) !== expectedPlanRevision) {
        await completion;
        if (!current.plan) throw new Error("IndexedDB revision conflict has no local plan.");
        return { status: "conflict", remote: current.plan };
      }
      await requestResult(
        store.put({ accountId, plan, syncState: { ...syncState } } as StoredPlanSync),
      );
      await this.commit(transaction, completion, "save-plan");
      this.notify(accountId, plan);
      return { status: "saved", revision: plan.revision };
    } finally {
      database.close();
    }
  }

  async replace(accountId: string, plan: PlanDocument): Promise<void> {
    parsePlanDocument(plan);
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(PLAN_STORE, "readwrite");
      const completion = transactionComplete(transaction);
      const store = transaction.objectStore(PLAN_STORE);
      const stored = await requestResult(
        store.get(accountId) as IDBRequest<StoredPlanSync | undefined>,
      );
      await requestResult(
        store.put({ accountId, plan, syncState: stored?.syncState } as StoredPlanSync),
      );
      await this.commit(transaction, completion, "replace-plan");
      this.notify(accountId, plan);
    } finally {
      database.close();
    }
  }

  async replacePlanAndSyncState(
    accountId: string,
    plan: PlanDocument,
    syncState: PlanSyncState,
  ): Promise<void> {
    parsePlanDocument(plan);
    assertSyncState(accountId, syncState);
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(PLAN_STORE, "readwrite");
      const completion = transactionComplete(transaction);
      await requestResult(
        transaction
          .objectStore(PLAN_STORE)
          .put({ accountId, plan, syncState: { ...syncState } } as StoredPlanSync),
      );
      await this.commit(transaction, completion, "replace-plan");
      this.notify(accountId, plan);
    } finally {
      database.close();
    }
  }

  subscribe(accountId: string, onRemoteChange: (plan: PlanChange) => void): () => void {
    const listeners = this.subscribers.get(accountId) ?? new Set();
    listeners.add(onRemoteChange);
    this.subscribers.set(accountId, listeners);
    return () => {
      listeners.delete(onRemoteChange);
      if (listeners.size === 0) this.subscribers.delete(accountId);
    };
  }

  async delete(accountId: string): Promise<void> {
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(PLAN_STORE, "readwrite");
      const completion = transactionComplete(transaction);
      await requestResult(transaction.objectStore(PLAN_STORE).delete(accountId));
      await this.commit(transaction, completion, "delete-plan");
      this.notify(accountId, null);
    } finally {
      database.close();
    }
  }

  async deletePlanAndSyncState(accountId: string, syncState: PlanSyncState): Promise<void> {
    assertSyncState(accountId, syncState);
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(PLAN_STORE, "readwrite");
      const completion = transactionComplete(transaction);
      await requestResult(
        transaction.objectStore(PLAN_STORE).put({
          accountId,
          plan: null,
          syncState: { ...syncState },
        } as StoredPlanSync),
      );
      await this.commit(transaction, completion, "delete-plan");
      this.notify(accountId, null);
    } finally {
      database.close();
    }
  }

  async acknowledgeSync(
    accountId: string,
    remoteRevision: number,
    acknowledgedPendingRevision: number,
  ): Promise<PlanSyncState> {
    if (
      !Number.isSafeInteger(remoteRevision) ||
      remoteRevision < 0 ||
      !Number.isSafeInteger(acknowledgedPendingRevision) ||
      acknowledgedPendingRevision < 0
    ) {
      throw new Error("The acknowledged sync revision is invalid.");
    }
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(PLAN_STORE, "readwrite");
      const completion = transactionComplete(transaction);
      const store = transaction.objectStore(PLAN_STORE);
      const stored = await requestResult(
        store.get(accountId) as IDBRequest<StoredPlanSync | undefined>,
      );
      const currentState = normalizeStored(stored).syncState ?? {
        accountId,
        remoteRevision: 0,
        pendingRevision: null,
        pendingDelete: false,
      };
      const clearsPending = currentState.pendingRevision === acknowledgedPendingRevision;
      const syncState = {
        ...currentState,
        remoteRevision: Math.max(currentState.remoteRevision, remoteRevision),
        pendingRevision: clearsPending ? null : currentState.pendingRevision,
        pendingDelete: clearsPending ? false : currentState.pendingDelete,
      };
      assertSyncState(accountId, syncState);
      await requestResult(
        store.put({
          accountId,
          plan: stored?.plan ?? null,
          syncState: { ...syncState },
        } as StoredPlanSync),
      );
      await this.commit(transaction, completion, "save-sync-state");
      return syncState;
    } finally {
      database.close();
    }
  }

  private notify(accountId: string, plan: PlanChange) {
    this.subscribers.get(accountId)?.forEach((listener) => listener(plan));
  }
}
