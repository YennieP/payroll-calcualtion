import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import { createSamplePlan } from "../../application/samplePlan";
import { MAX_PLAN_UTF8_BYTES } from "../../domain/plan";
import {
  LocalPlanRecoveryError,
  type LocalPlanSyncCommitKind,
  type PlanSyncState,
} from "../../ports/LocalPlanSyncRepository";
import { createPlanWithSerializedBytes } from "../../test/planFixtures";
import { LocalPlanRepository } from "./LocalPlanRepository";

const ACCOUNT_ID = "account-one";
const DEVICE_ID = "30000000-0000-4000-8000-000000000001";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
  });
}

async function seedVersionOnePlan(
  factory: IDBFactory,
  databaseName: string,
  plan: ReturnType<typeof createSamplePlan>,
) {
  const request = factory.open(databaseName, 1);
  request.addEventListener("upgradeneeded", () => {
    request.result.createObjectStore("plans", { keyPath: "accountId" });
  });
  const database = await requestResult(request);
  const transaction = database.transaction("plans", "readwrite");
  await requestResult(transaction.objectStore("plans").put({ accountId: ACCOUNT_ID, plan }));
  await transactionComplete(transaction);
  database.close();
}

async function seedLegacySyncState(
  factory: IDBFactory,
  databaseName: string,
  state: PlanSyncState,
) {
  const request = factory.open(databaseName, 1);
  request.addEventListener("upgradeneeded", () => {
    request.result.createObjectStore("sync-state", { keyPath: "accountId" });
  });
  const database = await requestResult(request);
  const transaction = database.transaction("sync-state", "readwrite");
  await requestResult(transaction.objectStore("sync-state").put(state));
  await transactionComplete(transaction);
  database.close();
}

class InterruptibleLocalPlanRepository extends LocalPlanRepository {
  private interruptedKind: LocalPlanSyncCommitKind | null = null;

  interruptNext(kind: LocalPlanSyncCommitKind) {
    this.interruptedKind = kind;
  }

  protected override beforeCommit(kind: LocalPlanSyncCommitKind): void {
    if (kind !== this.interruptedKind) return;
    this.interruptedKind = null;
    throw new Error(`Interrupted before ${kind} commit.`);
  }
}

describe("LocalPlanRepository atomic plan and sync persistence", () => {
  it("preserves and exports a pre-limit schema-v1 record that no longer passes validation", async () => {
    const factory = new IDBFactory();
    const databaseName = `worthwhile-pre-limit-${crypto.randomUUID()}`;
    const legacyPlan = createPlanWithSerializedBytes(DEVICE_ID, MAX_PLAN_UTF8_BYTES, 1);
    await seedVersionOnePlan(factory, databaseName, legacyPlan);

    const repository = new LocalPlanRepository(
      factory,
      databaseName,
      `worthwhile-legacy-${crypto.randomUUID()}`,
    );
    let recoveryError: LocalPlanRecoveryError | null = null;
    try {
      await repository.loadPlanSync(ACCOUNT_ID);
    } catch (error: unknown) {
      if (error instanceof LocalPlanRecoveryError) recoveryError = error;
      else throw error;
    }

    expect(recoveryError).not.toBeNull();
    expect(JSON.parse(recoveryError!.recoveryJson)).toMatchObject({
      schemaVersion: 1,
      planId: legacyPlan.planId,
      revision: 1,
    });

    const database = await requestResult(factory.open(databaseName));
    const transaction = database.transaction("plans", "readonly");
    const stored = await requestResult(transaction.objectStore("plans").get(ACCOUNT_ID));
    await transactionComplete(transaction);
    database.close();
    expect(stored).toMatchObject({ accountId: ACCOUNT_ID, plan: { planId: legacyPlan.planId } });
  });

  it("migrates the legacy sync database once without resurrecting cleared account data", async () => {
    const factory = new IDBFactory();
    const databaseName = `worthwhile-plan-v1-${crypto.randomUUID()}`;
    const legacyName = `worthwhile-sync-v1-${crypto.randomUUID()}`;
    const plan = { ...createSamplePlan(DEVICE_ID), revision: 4 };
    const syncState: PlanSyncState = {
      accountId: ACCOUNT_ID,
      remoteRevision: 3,
      pendingRevision: 4,
      pendingDelete: false,
    };
    await seedVersionOnePlan(factory, databaseName, plan);
    await seedLegacySyncState(factory, legacyName, syncState);

    const migrated = new LocalPlanRepository(factory, databaseName, legacyName);
    await expect(migrated.loadPlanSync(ACCOUNT_ID)).resolves.toMatchObject({
      plan: { revision: 4 },
      syncState,
    });

    await migrated.delete(ACCOUNT_ID);
    const reopened = new LocalPlanRepository(factory, databaseName, legacyName);
    await expect(reopened.loadPlanSync(ACCOUNT_ID)).resolves.toEqual({
      plan: null,
      syncState: null,
    });
  });

  it.each([
    ["plan serialization", "plan"],
    ["sync-state serialization", "syncState"],
  ] as const)("rolls back both values after a %s failure", async (_label, invalidPart) => {
    const factory = new IDBFactory();
    const databaseName = `worthwhile-atomic-${crypto.randomUUID()}`;
    const legacyName = `worthwhile-legacy-${crypto.randomUUID()}`;
    const repository = new LocalPlanRepository(factory, databaseName, legacyName);
    const originalPlan = { ...createSamplePlan(DEVICE_ID), revision: 1 };
    const originalState: PlanSyncState = {
      accountId: ACCOUNT_ID,
      remoteRevision: 1,
      pendingRevision: null,
      pendingDelete: false,
    };
    await repository.replacePlanAndSyncState(ACCOUNT_ID, originalPlan, originalState);

    const nextPlan = {
      ...originalPlan,
      revision: 2,
      ...(invalidPart === "plan" ? { uncloneable: () => undefined } : {}),
    };
    const nextState = {
      ...originalState,
      pendingRevision: 2,
      ...(invalidPart === "syncState" ? { uncloneable: () => undefined } : {}),
    } as PlanSyncState;

    await expect(
      repository.savePlanAndSyncState(ACCOUNT_ID, nextPlan, 1, nextState),
    ).rejects.toBeDefined();
    const reopened = new LocalPlanRepository(factory, databaseName, legacyName);
    await expect(reopened.loadPlanSync(ACCOUNT_ID)).resolves.toMatchObject({
      plan: { revision: 1 },
      syncState: originalState,
    });
  });

  it.each(["save-plan", "delete-plan"] as const)(
    "rolls back the complete record when %s is interrupted before commit",
    async (kind) => {
      const factory = new IDBFactory();
      const databaseName = `worthwhile-interrupt-${crypto.randomUUID()}`;
      const legacyName = `worthwhile-legacy-${crypto.randomUUID()}`;
      const repository = new InterruptibleLocalPlanRepository(factory, databaseName, legacyName);
      const originalPlan = { ...createSamplePlan(DEVICE_ID), revision: 1 };
      const originalState: PlanSyncState = {
        accountId: ACCOUNT_ID,
        remoteRevision: 1,
        pendingRevision: null,
        pendingDelete: false,
      };
      await repository.replacePlanAndSyncState(ACCOUNT_ID, originalPlan, originalState);
      repository.interruptNext(kind);

      if (kind === "save-plan") {
        await expect(
          repository.savePlanAndSyncState(ACCOUNT_ID, { ...originalPlan, revision: 2 }, 1, {
            ...originalState,
            pendingRevision: 2,
          }),
        ).rejects.toThrow("Interrupted before save-plan commit.");
      } else {
        await expect(
          repository.deletePlanAndSyncState(ACCOUNT_ID, {
            ...originalState,
            pendingRevision: 2,
            pendingDelete: true,
          }),
        ).rejects.toThrow("Interrupted before delete-plan commit.");
      }

      const reopened = new LocalPlanRepository(factory, databaseName, legacyName);
      await expect(reopened.loadPlanSync(ACCOUNT_ID)).resolves.toMatchObject({
        plan: { revision: 1 },
        syncState: originalState,
      });
    },
  );

  it("acknowledges only the uploaded revision and preserves a newer pending edit", async () => {
    const factory = new IDBFactory();
    const databaseName = `worthwhile-ack-${crypto.randomUUID()}`;
    const legacyName = `worthwhile-legacy-${crypto.randomUUID()}`;
    const repository = new LocalPlanRepository(factory, databaseName, legacyName);
    const plan = { ...createSamplePlan(DEVICE_ID), revision: 3 };
    await repository.replacePlanAndSyncState(ACCOUNT_ID, plan, {
      accountId: ACCOUNT_ID,
      remoteRevision: 1,
      pendingRevision: 3,
      pendingDelete: false,
    });

    await expect(repository.acknowledgeSync(ACCOUNT_ID, 2, 2)).resolves.toEqual({
      accountId: ACCOUNT_ID,
      remoteRevision: 2,
      pendingRevision: 3,
      pendingDelete: false,
    });
    await expect(repository.loadPlanSync(ACCOUNT_ID)).resolves.toMatchObject({
      plan: { revision: 3 },
      syncState: { remoteRevision: 2, pendingRevision: 3 },
    });

    await expect(repository.acknowledgeSync(ACCOUNT_ID, 3, 3)).resolves.toEqual({
      accountId: ACCOUNT_ID,
      remoteRevision: 3,
      pendingRevision: null,
      pendingDelete: false,
    });
  });
});
