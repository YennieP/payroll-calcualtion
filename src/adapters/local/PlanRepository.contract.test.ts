import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import { createSamplePlan } from "../../application/samplePlan";
import type { PlanRepository } from "../../ports/PlanRepository";
import { LocalPlanRepository } from "./LocalPlanRepository";
import { MemoryPlanRepository } from "./MemoryPlanRepository";

const ACCOUNT_ID = "anonymous-local";
const DEVICE_ID = "30000000-0000-4000-8000-000000000001";

function repositoryContract(name: string, createRepository: () => PlanRepository) {
  describe(`${name} PlanRepository contract`, () => {
    it("loads null, saves with a new revision, notifies, and deletes", async () => {
      const repository = createRepository();
      const plan = createSamplePlan(DEVICE_ID);
      const received: Array<number | null> = [];
      const unsubscribe = repository.subscribe(ACCOUNT_ID, (remote) => {
        received.push(remote?.revision ?? null);
      });

      await expect(repository.load(ACCOUNT_ID)).resolves.toBeNull();
      await expect(repository.save(ACCOUNT_ID, plan, 0)).resolves.toEqual({
        status: "saved",
        revision: 1,
      });
      await expect(repository.load(ACCOUNT_ID)).resolves.toMatchObject({ revision: 1 });
      expect(received).toEqual([1]);

      await repository.delete(ACCOUNT_ID);
      await expect(repository.load(ACCOUNT_ID)).resolves.toBeNull();
      expect(received).toEqual([1, null]);
      unsubscribe();
    });

    it("returns the current remote plan on a stale revision", async () => {
      const repository = createRepository();
      const plan = createSamplePlan(DEVICE_ID);
      await repository.save(ACCOUNT_ID, plan, 0);

      const result = await repository.save(
        ACCOUNT_ID,
        { ...plan, updatedAt: "2026-09-30T22:00:00.000Z" },
        0,
      );

      expect(result.status).toBe("conflict");
      if (result.status === "conflict") expect(result.remote.revision).toBe(1);
    });

    it("replaces the local cache with an exact remote revision", async () => {
      const repository = createRepository();
      const plan = { ...createSamplePlan(DEVICE_ID), revision: 14 };

      await repository.replace(ACCOUNT_ID, plan);

      await expect(repository.load(ACCOUNT_ID)).resolves.toMatchObject({ revision: 14 });
    });
  });
}

repositoryContract("memory", () => new MemoryPlanRepository());
repositoryContract(
  "IndexedDB",
  () => new LocalPlanRepository(new IDBFactory(), `worthwhile-contract-${crypto.randomUUID()}`),
);
