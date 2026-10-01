import { migratePlanDocument, parsePlanDocument } from "../../domain/plan";
import type { PlanDocument } from "../../domain/plan";
import type { PlanRepository, SaveResult } from "../../ports/PlanRepository";

const DEFAULT_DATABASE_NAME = "worthwhile-plans";
const DATABASE_VERSION = 1;
const PLAN_STORE = "plans";

interface StoredPlan {
  accountId: string;
  plan: PlanDocument;
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

export class LocalPlanRepository implements PlanRepository {
  private readonly subscribers = new Map<string, Set<(plan: PlanDocument) => void>>();

  constructor(
    private readonly factory: IDBFactory = globalThis.indexedDB,
    private readonly databaseName = DEFAULT_DATABASE_NAME,
  ) {
    if (!factory) throw new Error("IndexedDB is not available in this browser.");
  }

  private async openDatabase(): Promise<IDBDatabase> {
    const request = this.factory.open(this.databaseName, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(PLAN_STORE)) {
        request.result.createObjectStore(PLAN_STORE, { keyPath: "accountId" });
      }
    });
    return requestResult(request);
  }

  async load(accountId: string): Promise<PlanDocument | null> {
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(PLAN_STORE, "readonly");
      const stored = await requestResult(
        transaction.objectStore(PLAN_STORE).get(accountId) as IDBRequest<StoredPlan | undefined>,
      );
      await transactionComplete(transaction);
      return stored ? migratePlanDocument(stored.plan) : null;
    } finally {
      database.close();
    }
  }

  async save(accountId: string, plan: PlanDocument, expectedRevision: number): Promise<SaveResult> {
    parsePlanDocument(plan);
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(PLAN_STORE, "readwrite");
      const store = transaction.objectStore(PLAN_STORE);
      const stored = await requestResult(
        store.get(accountId) as IDBRequest<StoredPlan | undefined>,
      );
      const actualRevision = stored?.plan.revision ?? 0;
      if (actualRevision !== expectedRevision) {
        transaction.abort();
        if (!stored) throw new Error("IndexedDB revision conflict has no remote plan.");
        return { status: "conflict", remote: migratePlanDocument(stored.plan) };
      }

      const savedPlan: PlanDocument = { ...plan, revision: expectedRevision + 1 };
      await requestResult(store.put({ accountId, plan: savedPlan } as StoredPlan));
      await transactionComplete(transaction);
      this.notify(accountId, savedPlan);
      return { status: "saved", revision: savedPlan.revision };
    } finally {
      database.close();
    }
  }

  async replace(accountId: string, plan: PlanDocument): Promise<void> {
    parsePlanDocument(plan);
    const database = await this.openDatabase();
    try {
      const transaction = database.transaction(PLAN_STORE, "readwrite");
      await requestResult(
        transaction.objectStore(PLAN_STORE).put({ accountId, plan } as StoredPlan),
      );
      await transactionComplete(transaction);
      this.notify(accountId, plan);
    } finally {
      database.close();
    }
  }

  subscribe(accountId: string, onRemoteChange: (plan: PlanDocument) => void): () => void {
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
      transaction.objectStore(PLAN_STORE).delete(accountId);
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  }

  private notify(accountId: string, plan: PlanDocument) {
    this.subscribers.get(accountId)?.forEach((listener) => listener(plan));
  }
}
