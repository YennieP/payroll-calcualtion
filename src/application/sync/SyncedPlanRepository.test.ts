import { describe, expect, it } from "vitest";

import { MemoryPlanRepository } from "../../adapters/local/MemoryPlanRepository";
import { MemorySyncStateStore } from "../../adapters/local/MemorySyncStateStore";
import { createSamplePlan } from "../samplePlan";
import type { PlanDocument } from "../../domain/plan";
import type { RemotePlanRepository, RemoteSaveResult } from "../../ports/RemotePlanRepository";
import { SyncedPlanRepository } from "./SyncedPlanRepository";

const ACCOUNT_ID = "account-one";
const DEVICE_A = "30000000-0000-4000-8000-000000000001";
const DEVICE_B = "30000000-0000-4000-8000-000000000002";

class MemoryRemotePlanRepository implements RemotePlanRepository {
  private readonly plans = new Map<string, PlanDocument>();
  private readonly listeners = new Map<string, Set<(plan: PlanDocument) => void>>();

  async load(accountId: string): Promise<PlanDocument | null> {
    return this.plans.get(accountId) ?? null;
  }

  async push(
    accountId: string,
    plan: PlanDocument,
    expectedRemoteRevision: number,
  ): Promise<RemoteSaveResult> {
    const remote = this.plans.get(accountId);
    if ((remote?.revision ?? 0) !== expectedRemoteRevision) {
      if (!remote) throw new Error("Missing remote conflict plan.");
      return { status: "conflict", remote };
    }
    this.plans.set(accountId, plan);
    this.listeners.get(accountId)?.forEach((listener) => listener(plan));
    return { status: "saved", revision: plan.revision };
  }

  subscribe(accountId: string, onRemoteChange: (plan: PlanDocument) => void): () => void {
    const listeners = this.listeners.get(accountId) ?? new Set();
    listeners.add(onRemoteChange);
    this.listeners.set(accountId, listeners);
    return () => listeners.delete(onRemoteChange);
  }

  async delete(accountId: string): Promise<void> {
    this.plans.delete(accountId);
  }
}

describe("SyncedPlanRepository", () => {
  it("keeps only the latest offline plan and pushes it after reconnection", async () => {
    let online = false;
    const remote = new MemoryRemotePlanRepository();
    const repository = new SyncedPlanRepository(
      new MemoryPlanRepository(),
      remote,
      new MemorySyncStateStore(),
      () => online,
    );
    const sample = createSamplePlan(DEVICE_A);

    await repository.importPlan(ACCOUNT_ID, sample);
    const imported = await repository.load(ACCOUNT_ID);
    expect(imported?.revision).toBe(1);
    const edited = { ...imported!, updatedAt: "2026-10-01T18:00:00.000Z" };
    await expect(repository.save(ACCOUNT_ID, edited, 1)).resolves.toEqual({
      status: "saved",
      revision: 2,
    });
    expect(await remote.load(ACCOUNT_ID)).toBeNull();

    online = true;
    await expect(repository.flush(ACCOUNT_ID)).resolves.toEqual({
      status: "saved",
      revision: 2,
    });
    await expect(remote.load(ACCOUNT_ID)).resolves.toMatchObject({
      revision: 2,
      updatedAt: "2026-10-01T18:00:00.000Z",
    });
  });

  it("returns the newer remote plan when a stale device tries to overwrite it", async () => {
    const remote = new MemoryRemotePlanRepository();
    const first = new SyncedPlanRepository(
      new MemoryPlanRepository(),
      remote,
      new MemorySyncStateStore(),
      () => true,
    );
    const second = new SyncedPlanRepository(
      new MemoryPlanRepository(),
      remote,
      new MemorySyncStateStore(),
      () => true,
    );
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

    const secondEdit = {
      ...seed,
      updatedAt: "2026-10-01T19:01:00.000Z",
      updatedByDevice: DEVICE_B,
    };
    const staleResult = await second.save(ACCOUNT_ID, secondEdit, 1);
    expect(staleResult.status).toBe("conflict");
    if (staleResult.status === "conflict") {
      expect(staleResult.remote).toMatchObject({
        revision: 2,
        updatedByDevice: DEVICE_A,
      });
    }
    await expect(remote.load(ACCOUNT_ID)).resolves.toMatchObject({
      revision: 2,
      updatedByDevice: DEVICE_A,
    });
  });

  it("preserves an offline local edit when another device creates the same revision", async () => {
    let online = true;
    const remote = new MemoryRemotePlanRepository();
    const local = new MemoryPlanRepository();
    const syncStates = new MemorySyncStateStore();
    const repository = new SyncedPlanRepository(local, remote, syncStates, () => online);
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
    const reopened = new SyncedPlanRepository(local, remote, syncStates, () => online);
    await expect(reopened.load(ACCOUNT_ID)).resolves.toMatchObject({
      revision: 2,
      updatedByDevice: DEVICE_B,
    });
    const conflict = new Promise<PlanDocument>((resolve) => {
      reopened.subscribe(ACCOUNT_ID, resolve);
    });
    await expect(conflict).resolves.toMatchObject({
      revision: 2,
      updatedByDevice: DEVICE_A,
    });
    await expect(remote.load(ACCOUNT_ID)).resolves.toMatchObject({
      revision: 2,
      updatedByDevice: DEVICE_A,
    });
  });
});
