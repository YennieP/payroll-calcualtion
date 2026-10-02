import { readFile } from "node:fs/promises";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PROJECT_ID = "demo-worthwhile-local";
const OWNER_ID = "owner-one";
const OTHER_ID = "owner-two";

const VALID_PLAN = {
  schemaVersion: 1,
  planId: "10000000-0000-4000-8000-000000000001",
  revision: 1,
  updatedAt: "2026-10-01T20:00:00.000Z",
  updatedByDevice: "30000000-0000-4000-8000-000000000001",
  taxProfile: {
    state: "CA",
    filingStatus: "single",
    monthlyPretaxDeductionCents: 50_000,
    bufferBasisPoints: 500,
    planningYear: 2026,
    taxRuleVersion: "us-ca-w2-2026-v1",
  },
  preferences: { themeId: "rouge" },
  categories: [],
};

const VALID_TOMBSTONE = {
  kind: "deleted",
  revision: 3,
  deletedAt: "2026-10-02T20:00:00.000Z",
};

let environment: RulesTestEnvironment;

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: await readFile("firebase/firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
});

afterAll(async () => {
  await environment.cleanup();
});

describe("owner-scoped Firestore rules", () => {
  it("allows a versioned owner lifecycle while rejecting stale, malformed, and physical deletes", async () => {
    const owner = environment.authenticatedContext(OWNER_ID).firestore();
    const reference = doc(owner, "plans", OWNER_ID);

    await assertSucceeds(setDoc(reference, VALID_PLAN));
    await assertSucceeds(getDoc(reference));
    await assertFails(updateDoc(reference, { revision: 1 }));
    await assertFails(updateDoc(reference, { revision: 2, unexpected: true }));
    await assertSucceeds(
      updateDoc(reference, {
        revision: 2,
        updatedAt: "2026-10-01T20:01:00.000Z",
      }),
    );
    await assertSucceeds(setDoc(reference, VALID_TOMBSTONE));
    await assertFails(setDoc(reference, { ...VALID_PLAN, revision: 3 }));
    await assertSucceeds(setDoc(reference, { ...VALID_PLAN, revision: 4 }));
    await assertFails(deleteDoc(reference));
  });

  it("denies unauthenticated, cross-user, and undeclared-path access", async () => {
    const owner = environment.authenticatedContext(OWNER_ID).firestore();
    await assertSucceeds(setDoc(doc(owner, "plans", OWNER_ID), VALID_PLAN));

    const anonymous = environment.unauthenticatedContext().firestore();
    const other = environment.authenticatedContext(OTHER_ID).firestore();
    await assertFails(getDoc(doc(anonymous, "plans", OWNER_ID)));
    await assertFails(getDoc(doc(other, "plans", OWNER_ID)));
    await assertFails(updateDoc(doc(other, "plans", OWNER_ID), { revision: 2 }));
    await assertFails(deleteDoc(doc(other, "plans", OWNER_ID)));
    await assertFails(setDoc(doc(owner, "private", OWNER_ID), { value: true }));
  });

  it("rejects every nested profile and preference shape that rules can validate", async () => {
    const owner = environment.authenticatedContext(OWNER_ID).firestore();
    const reference = doc(owner, "plans", OWNER_ID);

    await assertFails(
      setDoc(reference, {
        ...VALID_PLAN,
        taxProfile: { ...VALID_PLAN.taxProfile, filingStatus: "joint" },
      }),
    );
    await assertFails(
      setDoc(reference, {
        ...VALID_PLAN,
        taxProfile: { ...VALID_PLAN.taxProfile, monthlyPretaxDeductionCents: 50_000_001 },
      }),
    );
    await assertFails(
      setDoc(reference, {
        ...VALID_PLAN,
        taxProfile: { ...VALID_PLAN.taxProfile, taxRuleVersion: "unregistered-rules" },
      }),
    );
    await assertFails(
      setDoc(reference, {
        ...VALID_PLAN,
        taxProfile: { ...VALID_PLAN.taxProfile, unexpected: true },
      }),
    );
    await assertFails(
      setDoc(reference, {
        ...VALID_PLAN,
        preferences: { themeId: "rouge", unexpected: true },
      }),
    );
    await assertFails(
      setDoc(reference, {
        ...VALID_PLAN,
        preferences: { themeId: "unknown-theme" },
      }),
    );
  });

  it("enforces the rules-expressible category count boundary", async () => {
    const owner = environment.authenticatedContext(OWNER_ID).firestore();
    const reference = doc(owner, "plans", OWNER_ID);
    const categories = Array.from({ length: 50 }, (_, index) => ({ index }));
    const taxProfile = {
      ...VALID_PLAN.taxProfile,
      monthlyPretaxDeductionCents: 50_000_000,
    };

    await assertSucceeds(setDoc(reference, { ...VALID_PLAN, taxProfile, categories }));
    await assertFails(
      setDoc(reference, { ...VALID_PLAN, revision: 2, categories: [...categories, {}] }),
    );
  });
});
