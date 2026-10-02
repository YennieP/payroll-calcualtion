import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import { createSamplePlan } from "../../application/samplePlan";
import { createPlanWithSerializedBytes } from "../../test/planFixtures";
import {
  getSerializedPlanByteLength,
  MAX_MONTHLY_GOAL_AMOUNT_CENTS,
  MAX_PLAN_UTF8_BYTES,
  PlanConstraintError,
} from "../../domain/plan";
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

    it("rejects an out-of-contract plan without replacing the last valid revision", async () => {
      const repository = createRepository();
      const valid = createSamplePlan(DEVICE_ID);
      await repository.save(ACCOUNT_ID, valid, 0);
      const invalid = structuredClone(valid);
      invalid.categories[0].goals[0].monthlyAmountCents = MAX_MONTHLY_GOAL_AMOUNT_CENTS + 1;

      await expect(repository.save(ACCOUNT_ID, invalid, 1)).rejects.toBeInstanceOf(
        PlanConstraintError,
      );
      const retained = await repository.load(ACCOUNT_ID);
      expect(retained?.revision).toBe(1);
      expect(retained?.categories[0].goals[0].monthlyAmountCents).toBe(
        valid.categories[0].goals[0].monthlyAmountCents,
      );
    });

    it("validates the final document after a revision gains another digit", async () => {
      const repository = createRepository();
      const plan = createPlanWithSerializedBytes(DEVICE_ID, MAX_PLAN_UTF8_BYTES, 9);
      expect(getSerializedPlanByteLength(plan)).toBe(MAX_PLAN_UTF8_BYTES);
      await repository.replace(ACCOUNT_ID, plan);

      await expect(repository.save(ACCOUNT_ID, plan, 9)).rejects.toBeInstanceOf(
        PlanConstraintError,
      );
      await expect(repository.load(ACCOUNT_ID)).resolves.toMatchObject({ revision: 9 });
    });
  });
}

repositoryContract("memory", () => new MemoryPlanRepository());
repositoryContract(
  "IndexedDB",
  () => new LocalPlanRepository(new IDBFactory(), `worthwhile-contract-${crypto.randomUUID()}`),
);
