import { describe, expect, it, vi } from "vitest";

import { MemoryPlanRepository } from "../../adapters/local/MemoryPlanRepository";
import { createSamplePlan } from "../samplePlan";
import {
  MAX_MONTHLY_GOAL_AMOUNT_CENTS,
  PlanConstraintError,
  type PlanDocument,
} from "../../domain/plan";
import type {
  RemotePlanRepository,
  RemotePlanSnapshot,
  RemotePlanTombstone,
  RemoteSaveResult,
} from "../../ports/RemotePlanRepository";
import { RemotePlanReadError } from "../../ports/RemotePlanRepository";
import { SyncedPlanRepository, type CloudSyncSnapshot } from "./SyncedPlanRepository";

const ACCOUNT_ID = "account-one";
const DEVICE_A = "30000000-0000-4000-8000-000000000001";
const DEVICE_B = "30000000-0000-4000-8000-000000000002";

class MemoryRemotePlanRepository implements RemotePlanRepository {
  private readonly snapshots = new Map<string, RemotePlanSnapshot>();
  private readonly listeners = new Map<
    string,
    Set<{
      onRemoteChange: (snapshot: RemotePlanSnapshot) => void;
      onError: (error: RemotePlanReadError) => void;
    }>
  >();
  private nextPushGate: { markStarted: () => void; waitForRelease: Promise<void> } | null = null;
  loadError: Error | null = null;

  deferNextPush() {
    let markStarted: () => void = () => undefined;
    let release: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const waitForRelease = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.nextPushGate = { markStarted, waitForRelease };
    return { started, release };
  }

  async load(accountId: string): Promise<RemotePlanSnapshot | null> {
    if (this.loadError) throw this.loadError;
    return this.snapshots.get(accountId) ?? null;
  }

  async push(
    accountId: string,
    plan: PlanDocument,
    expectedRemoteRevision: number,
  ): Promise<RemoteSaveResult> {
    const remote = this.snapshots.get(accountId);
    if (this.revision(remote) !== expectedRemoteRevision) {
      if (!remote) throw new Error("Missing remote conflict plan.");
      return { status: "conflict", remote };
    }
    const gate = this.nextPushGate;
    this.nextPushGate = null;
    if (gate) {
      gate.markStarted();
      await gate.waitForRelease;
    }
    const snapshot = { kind: "plan", plan } as const;
    this.snapshots.set(accountId, snapshot);
    this.listeners.get(accountId)?.forEach(({ onRemoteChange }) => onRemoteChange(snapshot));
    return { status: "saved", revision: plan.revision };
  }

  subscribe(
    accountId: string,
    onRemoteChange: (snapshot: RemotePlanSnapshot) => void,
    onError: (error: RemotePlanReadError) => void,
  ): () => void {
    const listeners = this.listeners.get(accountId) ?? new Set();
    const listener = { onRemoteChange, onError };
    listeners.add(listener);
    this.listeners.set(accountId, listeners);
    return () => listeners.delete(listener);
  }

  emitReadError(accountId: string, error: RemotePlanReadError) {
    this.listeners.get(accountId)?.forEach(({ onError }) => onError(error));
  }

  async delete(accountId: string, requested: RemotePlanTombstone) {
    const revision = Math.max(requested.revision, this.revision(this.snapshots.get(accountId)) + 1);
    const snapshot = {
      kind: "deleted",
      tombstone: { ...requested, revision },
    } as const;
    this.snapshots.set(accountId, snapshot);
    this.listeners.get(accountId)?.forEach(({ onRemoteChange }) => onRemoteChange(snapshot));
    return { revision };
  }

  private revision(snapshot: RemotePlanSnapshot | undefined): number {
    if (!snapshot) return 0;
    return snapshot.kind === "plan" ? snapshot.plan.revision : snapshot.tombstone.revision;
  }
}

describe("SyncedPlanRepository", () => {
  it("does not turn an unavailable cloud document into a missing plan without local data", async () => {
    const remote = new MemoryRemotePlanRepository();
    remote.loadError = new RemotePlanReadError("unavailable", "Cloud temporarily unavailable.");
    const repository = new SyncedPlanRepository(new MemoryPlanRepository(), remote, () => true);
    const snapshots: CloudSyncSnapshot[] = [];
    repository.subscribeSync((snapshot) => snapshots.push(snapshot));

    await expect(repository.load(ACCOUNT_ID)).rejects.toMatchObject({
      name: "RemotePlanReadError",
      kind: "unavailable",
    });
    expect(snapshots.at(-1)).toEqual({
      status: "error",
      error: "Cloud temporarily unavailable.",
      errorKind: "unavailable",
    });
  });

  it("keeps a valid local plan while surfacing a corrupt cloud document", async () => {
    const local = new MemoryPlanRepository();
    const localPlan = { ...createSamplePlan(DEVICE_A), revision: 1 };
    await local.replace(ACCOUNT_ID, localPlan);
    const remote = new MemoryRemotePlanRepository();
    remote.loadError = new RemotePlanReadError("corrupt", "Cloud plan is corrupt.");
    const repository = new SyncedPlanRepository(local, remote, () => true);
    const snapshots: CloudSyncSnapshot[] = [];
    repository.subscribeSync((snapshot) => snapshots.push(snapshot));

    await expect(repository.load(ACCOUNT_ID)).resolves.toEqual(localPlan);
    expect(snapshots.at(-1)).toEqual({
      status: "error",
      error: "Cloud plan is corrupt.",
      errorKind: "corrupt",
    });
    await expect(local.load(ACCOUNT_ID)).resolves.toEqual(localPlan);
  });

  it("routes subscription read failures into the controlled sync state", async () => {
    const remote = new MemoryRemotePlanRepository();
    const repository = new SyncedPlanRepository(new MemoryPlanRepository(), remote, () => true);
    const snapshots: CloudSyncSnapshot[] = [];
    repository.subscribeSync((snapshot) => snapshots.push(snapshot));
    repository.subscribe(ACCOUNT_ID, vi.fn());

    remote.emitReadError(
      ACCOUNT_ID,
      new RemotePlanReadError("unavailable", "Subscription temporarily unavailable."),
    );

    expect(snapshots.at(-1)).toEqual({
      status: "error",
      error: "Subscription temporarily unavailable.",
      errorKind: "unavailable",
    });
  });

  it("rejects an out-of-contract plan before it becomes pending or reaches the cloud", async () => {
    const remote = new MemoryRemotePlanRepository();
    const push = vi.spyOn(remote, "push");
    const local = new MemoryPlanRepository();
    const repository = new SyncedPlanRepository(local, remote, () => true);
    const invalid = createSamplePlan(DEVICE_A);
    invalid.categories[0].goals[0].monthlyAmountCents = MAX_MONTHLY_GOAL_AMOUNT_CENTS + 1;

    await expect(repository.save(ACCOUNT_ID, invalid, 0)).rejects.toBeInstanceOf(
      PlanConstraintError,
    );
    await expect(local.loadPlanSync(ACCOUNT_ID)).resolves.toMatchObject({
      plan: null,
      syncState: null,
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps only the latest offline plan and pushes it after reconnection", async () => {
    let online = false;
    const remote = new MemoryRemotePlanRepository();
    const repository = new SyncedPlanRepository(new MemoryPlanRepository(), remote, () => online);
    const sample = createSamplePlan(DEVICE_A);

    await repository.importPlan(ACCOUNT_ID, sample);
    const imported = await repository.load(ACCOUNT_ID);
    expect(imported?.revision).toBe(1);
    const edited = { ...imported!, updatedAt: "2026-10-01T18:00:00.000Z" };
    await expect(repository.save(ACCOUNT_ID, edited, 1)).resolves.toEqual({
      status: "saved",
      revision: 2,
    });
    await expect(repository.hasPendingChanges(ACCOUNT_ID)).resolves.toBe(true);
    expect(await remote.load(ACCOUNT_ID)).toBeNull();

    online = true;
    await expect(repository.flush(ACCOUNT_ID)).resolves.toEqual({
      status: "saved",
      revision: 2,
    });
    await expect(remote.load(ACCOUNT_ID)).resolves.toMatchObject({
      kind: "plan",
      plan: { revision: 2, updatedAt: "2026-10-01T18:00:00.000Z" },
    });
    await expect(repository.hasPendingChanges(ACCOUNT_ID)).resolves.toBe(false);
  });

  it("serializes overlapping cloud flushes without clearing a newer pending edit", async () => {
    const remote = new MemoryRemotePlanRepository();
    const local = new MemoryPlanRepository();
    const repository = new SyncedPlanRepository(local, remote, () => true);
    const seed = { ...createSamplePlan(DEVICE_A), revision: 1 };
    await remote.push(ACCOUNT_ID, seed, 0);
    await repository.load(ACCOUNT_ID);
    const received = vi.fn();
    repository.subscribe(ACCOUNT_ID, received);

    const firstEdit = {
      ...seed,
      updatedAt: "2026-10-02T21:00:00.000Z",
      updatedByDevice: DEVICE_A,
    };
    await repository.save(ACCOUNT_ID, firstEdit, 1);
    const gate = remote.deferNextPush();
    const firstFlush = repository.flush(ACCOUNT_ID);
    await gate.started;

    const secondEdit = {
      ...firstEdit,
      updatedAt: "2026-10-02T21:00:01.000Z",
    };
    await expect(repository.save(ACCOUNT_ID, secondEdit, 2)).resolves.toEqual({
      status: "saved",
      revision: 3,
    });
    received.mockClear();
    const secondFlush = repository.flush(ACCOUNT_ID);
    gate.release();
    await expect(firstFlush).resolves.toEqual({ status: "saved", revision: 2 });
    await expect(secondFlush).resolves.toEqual({
      status: "saved",
      revision: 3,
    });
    await Promise.resolve();

    await expect(local.loadPlanSync(ACCOUNT_ID)).resolves.toMatchObject({
      plan: { revision: 3, updatedAt: "2026-10-02T21:00:01.000Z" },
      syncState: { remoteRevision: 3, pendingRevision: null, pendingDelete: false },
    });
    expect(received).not.toHaveBeenCalled();
    await expect(remote.load(ACCOUNT_ID)).resolves.toMatchObject({
      kind: "plan",
      plan: { revision: 3, updatedAt: "2026-10-02T21:00:01.000Z" },
    });
  });

  it("returns the newer remote plan when a stale device tries to overwrite it", async () => {
    const remote = new MemoryRemotePlanRepository();
    const first = new SyncedPlanRepository(new MemoryPlanRepository(), remote, () => true);
    const second = new SyncedPlanRepository(new MemoryPlanRepository(), remote, () => true);
    const seed = { ...createSamplePlan(DEVICE_A), revision: 1 };
    await remote.push(ACCOUNT_ID, seed, 0);
    await first.load(ACCOUNT_ID);
    await second.load(ACCOUNT_ID);

    const firstEdit = {
      ...seed,
      updatedAt: "2026-10-01T19:00:00.000Z",
      updatedByDevice: DEVICE_A,
    };
    await expect(first.save(ACCOUNT_ID, firstEdit, 1)).resolves.toEqual({
      status: "saved",
      revision: 2,
    });
    await expect(first.flush(ACCOUNT_ID)).resolves.toEqual({
      status: "saved",
      revision: 2,
    });

    const secondEdit = {
      ...seed,
      updatedAt: "2026-10-01T19:01:00.000Z",
      updatedByDevice: DEVICE_B,
    };
    await expect(second.save(ACCOUNT_ID, secondEdit, 1)).resolves.toEqual({
      status: "saved",
      revision: 2,
    });
    const staleResult = await second.flush(ACCOUNT_ID);
    expect(staleResult.status).toBe("conflict");
    if (staleResult.status === "conflict") {
      expect(staleResult.remote).toMatchObject({
        revision: 2,
        updatedByDevice: DEVICE_A,
      });
    }
    await expect(remote.load(ACCOUNT_ID)).resolves.toMatchObject({
      kind: "plan",
      plan: { revision: 2, updatedByDevice: DEVICE_A },
    });
  });

  it("preserves an offline local edit when another device creates the same revision", async () => {
    let online = true;
    const remote = new MemoryRemotePlanRepository();
    const local = new MemoryPlanRepository();
    const repository = new SyncedPlanRepository(local, remote, () => online);
    const seed = { ...createSamplePlan(DEVICE_A), revision: 1 };
    await remote.push(ACCOUNT_ID, seed, 0);
    await repository.load(ACCOUNT_ID);

    online = false;
    const localEdit = {
      ...seed,
      updatedAt: "2026-10-01T19:10:00.000Z",
      updatedByDevice: DEVICE_B,
    };
    await expect(repository.save(ACCOUNT_ID, localEdit, 1)).resolves.toEqual({
      status: "saved",
      revision: 2,
    });
    await remote.push(
      ACCOUNT_ID,
      {
        ...seed,
        revision: 2,
        updatedAt: "2026-10-01T19:11:00.000Z",
        updatedByDevice: DEVICE_A,
      },
      1,
    );

    online = true;
    const reopened = new SyncedPlanRepository(local, remote, () => online);
    await expect(reopened.load(ACCOUNT_ID)).resolves.toMatchObject({
      revision: 2,
      updatedByDevice: DEVICE_B,
    });
    const conflict = new Promise<PlanDocument>((resolve) => {
      reopened.subscribe(ACCOUNT_ID, (plan) => {
        if (plan) resolve(plan);
      });
    });
    await expect(conflict).resolves.toMatchObject({
      revision: 2,
      updatedByDevice: DEVICE_A,
    });
    await expect(remote.load(ACCOUNT_ID)).resolves.toMatchObject({
      kind: "plan",
      plan: { revision: 2, updatedByDevice: DEVICE_A },
    });
  });

  it("flushes an offline deletion after reopen instead of restoring the deleted plan", async () => {
    let online = true;
    const remote = new MemoryRemotePlanRepository();
    const local = new MemoryPlanRepository();
    const repository = new SyncedPlanRepository(local, remote, () => online);
    const seed = { ...createSamplePlan(DEVICE_A), revision: 1 };
    await remote.push(ACCOUNT_ID, seed, 0);
    await repository.load(ACCOUNT_ID);

    online = false;
    await repository.delete(ACCOUNT_ID);
    await expect(local.load(ACCOUNT_ID)).resolves.toBeNull();
    await expect(local.loadPlanSync(ACCOUNT_ID)).resolves.toMatchObject({
      plan: null,
      syncState: {
        remoteRevision: 1,
        pendingRevision: 2,
        pendingDelete: true,
      },
    });

    online = true;
    const reopened = new SyncedPlanRepository(local, remote, () => online);
    await expect(reopened.load(ACCOUNT_ID)).resolves.toBeNull();
    await expect(remote.load(ACCOUNT_ID)).resolves.toMatchObject({
      kind: "deleted",
      tombstone: { revision: 2 },
    });
    await expect(local.loadPlanSync(ACCOUNT_ID)).resolves.toMatchObject({
      plan: null,
      syncState: {
        remoteRevision: 2,
        pendingRevision: null,
        pendingDelete: false,
      },
    });
  });

  it("propagates deletion and recreates the plan above the tombstone revision", async () => {
    const remote = new MemoryRemotePlanRepository();
    const firstLocal = new MemoryPlanRepository();
    const secondLocal = new MemoryPlanRepository();
    const first = new SyncedPlanRepository(firstLocal, remote, () => true);
    const second = new SyncedPlanRepository(secondLocal, remote, () => true);
    const seed = { ...createSamplePlan(DEVICE_A), revision: 1 };
    await remote.push(ACCOUNT_ID, seed, 0);
    await first.load(ACCOUNT_ID);
    await second.load(ACCOUNT_ID);

    const deletionReceived = new Promise<void>((resolve) => {
      second.subscribe(ACCOUNT_ID, (plan) => {
        if (plan === null) resolve();
      });
    });
    await first.delete(ACCOUNT_ID);
    await deletionReceived;
    await expect(secondLocal.load(ACCOUNT_ID)).resolves.toBeNull();

    const recreated = createSamplePlan(DEVICE_A);
    recreated.categories[0].goals[0].monthlyAmountCents = 333_300;
    await first.replace(ACCOUNT_ID, recreated);
    await expect(first.save(ACCOUNT_ID, recreated, 0)).resolves.toEqual({
      status: "saved",
      revision: 3,
    });
    await expect(first.flush(ACCOUNT_ID)).resolves.toEqual({
      status: "saved",
      revision: 3,
    });
    const remoteAfterRecreate = await remote.load(ACCOUNT_ID);
    expect(remoteAfterRecreate?.kind).toBe("plan");
    if (remoteAfterRecreate?.kind !== "plan") {
      throw new Error("Expected the recreated remote snapshot to contain a plan.");
    }
    expect(remoteAfterRecreate.plan.revision).toBe(3);
    expect(remoteAfterRecreate.plan.categories[0].goals[0].monthlyAmountCents).toBe(333_300);
  });

  it("prevents a stale offline device from overwriting a plan recreated after deletion", async () => {
    let secondOnline = true;
    const remote = new MemoryRemotePlanRepository();
    const first = new SyncedPlanRepository(new MemoryPlanRepository(), remote, () => true);
    const second = new SyncedPlanRepository(new MemoryPlanRepository(), remote, () => secondOnline);
    const seed = { ...createSamplePlan(DEVICE_A), revision: 1 };
    await remote.push(ACCOUNT_ID, seed, 0);
    await first.load(ACCOUNT_ID);
    await second.load(ACCOUNT_ID);

    secondOnline = false;
    await first.delete(ACCOUNT_ID);
    const recreated = createSamplePlan(DEVICE_A);
    recreated.categories[0].goals[0].monthlyAmountCents = 333_300;
    await first.replace(ACCOUNT_ID, recreated);
    await first.save(ACCOUNT_ID, recreated, 0);
    await first.flush(ACCOUNT_ID);

    const stale = {
      ...seed,
      updatedAt: "2026-10-02T20:00:00.000Z",
      updatedByDevice: DEVICE_B,
    };
    await expect(second.save(ACCOUNT_ID, stale, 1)).resolves.toEqual({
      status: "saved",
      revision: 2,
    });
    secondOnline = true;
    await expect(second.flush(ACCOUNT_ID)).resolves.toMatchObject({
      status: "conflict",
      remote: { revision: 3 },
    });
    const remoteAfterStaleFlush = await remote.load(ACCOUNT_ID);
    expect(remoteAfterStaleFlush?.kind).toBe("plan");
    if (remoteAfterStaleFlush?.kind !== "plan") {
      throw new Error("Expected the recreated remote snapshot to remain a plan.");
    }
    expect(remoteAfterStaleFlush.plan.revision).toBe(3);
    expect(remoteAfterStaleFlush.plan.categories[0].goals[0].monthlyAmountCents).toBe(333_300);
  });
});
