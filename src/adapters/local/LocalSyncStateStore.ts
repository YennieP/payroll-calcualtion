import type { PlanSyncState, SyncStateStore } from "../../ports/SyncStateStore";

const DEFAULT_DATABASE_NAME = "worthwhile-sync";
const DATABASE_VERSION = 1;
const SYNC_STORE = "sync-state";

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

export class LocalSyncStateStore implements SyncStateStore {
  constructor(
    private readonly factory: IDBFactory = globalThis.indexedDB,
    private readonly databaseName = DEFAULT_DATABASE_NAME,
  ) {
    if (!factory) throw new Error("IndexedDB is not available in this browser.");
  }

  private async openDatabase(): Promise<IDBDatabase> {
    const request = this.factory.open(this.databaseName, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(SYNC_STORE)) {
        request.result.createObjectStore(SYNC_STORE, { keyPath: "accountId" });
      }
    });
    return requestResult(request);
  }

  async load(accountId: string): Promise<PlanSyncState | null> {
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(SYNC_STORE, "readonly");
      const state = await requestResult(
        transaction.objectStore(SYNC_STORE).get(accountId) as IDBRequest<PlanSyncState | undefined>,
      );
      await transactionComplete(transaction);
      return state ?? null;
    } finally {
      database.close();
    }
  }

  async save(state: PlanSyncState): Promise<void> {
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(SYNC_STORE, "readwrite");
      await requestResult(transaction.objectStore(SYNC_STORE).put(state));
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  }

  async delete(accountId: string): Promise<void> {
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(SYNC_STORE, "readwrite");
      transaction.objectStore(SYNC_STORE).delete(accountId);
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  }
}
