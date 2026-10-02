import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, doc, getFirestore, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FirebaseAuthProvider } from "../../src/adapters/firebase/FirebaseAuthProvider";
import { FirebasePlanRepository } from "../../src/adapters/firebase/FirebasePlanRepository";
import { createSamplePlan } from "../../src/application/samplePlan";
import { MAX_MONTHLY_GOAL_AMOUNT_CENTS, PlanConstraintError } from "../../src/domain/plan";
import { RemotePlanReadError } from "../../src/ports/RemotePlanRepository";

const PROJECT_ID = "demo-worthwhile-local";
const EMULATOR_CONFIG = {
  apiKey: "demo-key",
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  appId: "1:123456789:web:123456789",
};

const apps: FirebaseApp[] = [];
let rulesEnvironment: RulesTestEnvironment;

function createContext(name: string) {
  const app = initializeApp(EMULATOR_CONFIG, name);
  apps.push(app);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  return {
    auth: new FirebaseAuthProvider(auth),
    plans: new FirebasePlanRepository(firestore),
  };
}

beforeAll(async () => {
  rulesEnvironment = await initializeTestEnvironment({ projectId: PROJECT_ID });
});

afterAll(async () => {
  await Promise.all([...apps.map((app) => deleteApp(app)), rulesEnvironment.cleanup()]);
});

async function seedWithoutRules(accountId: string, value: unknown) {
  await rulesEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "plans", accountId), value);
  });
}

describe("Firebase adapters across independent contexts", () => {
  it("rejects an out-of-contract plan before opening a Firestore transaction", async () => {
    const context = createContext("capacity-context");
    const invalid = { ...createSamplePlan("30000000-0000-4000-8000-000000000001"), revision: 1 };
    invalid.categories[0].goals[0].monthlyAmountCents = MAX_MONTHLY_GOAL_AMOUNT_CENTS + 1;

    await expect(context.plans.push("capacity-account", invalid, 0)).rejects.toBeInstanceOf(
      PlanConstraintError,
    );
  });

  it("classifies an over-limit cloud document as corrupt on initial load", async () => {
    const context = createContext("corrupt-load-context");
    const account = await context.auth.registerWithEmail("corrupt-load@example.test", "password");
    const invalid = { ...createSamplePlan("30000000-0000-4000-8000-000000000001"), revision: 1 };
    invalid.categories[0].goals[0].monthlyAmountCents = MAX_MONTHLY_GOAL_AMOUNT_CENTS + 1;
    await seedWithoutRules(account.id, invalid);

    await expect(context.plans.load(account.id)).rejects.toMatchObject({
      name: "RemotePlanReadError",
      kind: "corrupt",
    });
  });

  it("routes subscription parse failures through the corrupt-data callback", async () => {
    const context = createContext("corrupt-subscription-context");
    const account = await context.auth.registerWithEmail(
      "corrupt-subscription@example.test",
      "password",
    );
    const invalid = {
      ...createSamplePlan("30000000-0000-4000-8000-000000000001"),
      revision: 1,
      preferences: { themeId: "unknown-theme" },
    };

    const receivedError = new Promise<RemotePlanReadError>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timed out waiting for corrupt data.")),
        5_000,
      );
      const unsubscribe = context.plans.subscribe(
        account.id,
        () => reject(new Error("Corrupt data reached the success callback.")),
        (error) => {
          clearTimeout(timeout);
          unsubscribe();
          resolve(error);
        },
      );
    });
    await seedWithoutRules(account.id, invalid);

    await expect(receivedError).resolves.toMatchObject({
      name: "RemotePlanReadError",
      kind: "corrupt",
    });
  });

  it("authenticates one account twice, synchronizes revisions, and isolates another user", async () => {
    const desktop = createContext("desktop-context");
    const phone = createContext("phone-context");
    const outsider = createContext("outsider-context");
    const email = "phase6@example.test";
    const password = "phase6-password";

    const account = await desktop.auth.registerWithEmail(email, password);
    await desktop.auth.sendPasswordResetEmail(email);
    await phone.auth.signInWithEmail(email, password);

    const first = { ...createSamplePlan("30000000-0000-4000-8000-000000000001"), revision: 1 };
    await expect(desktop.plans.push(account.id, first, 0)).resolves.toEqual({
      status: "saved",
      revision: 1,
    });
    await expect(phone.plans.load(account.id)).resolves.toMatchObject({
      kind: "plan",
      plan: { revision: 1 },
    });

    const second = {
      ...first,
      revision: 2,
      updatedAt: "2026-10-01T20:02:00.000Z",
      updatedByDevice: "30000000-0000-4000-8000-000000000002",
    };
    await expect(desktop.plans.push(account.id, second, 1)).resolves.toEqual({
      status: "saved",
      revision: 2,
    });
    await expect(phone.plans.push(account.id, { ...first, revision: 2 }, 1)).resolves.toMatchObject(
      {
        status: "conflict",
        remote: { kind: "plan", plan: { revision: 2 } },
      },
    );

    const deletionReceived = new Promise<void>((resolve, reject) => {
      let unsubscribe = () => {};
      unsubscribe = phone.plans.subscribe(
        account.id,
        (snapshot) => {
          if (snapshot.kind !== "deleted") return;
          unsubscribe();
          resolve();
        },
        reject,
      );
    });
    await expect(
      desktop.plans.delete(account.id, {
        kind: "deleted",
        revision: 3,
        deletedAt: "2026-10-02T20:03:00.000Z",
      }),
    ).resolves.toEqual({ revision: 3 });
    await deletionReceived;
    await expect(phone.plans.load(account.id)).resolves.toMatchObject({
      kind: "deleted",
      tombstone: { revision: 3 },
    });

    const recreated = {
      ...first,
      revision: 4,
      updatedAt: "2026-10-02T20:04:00.000Z",
    };
    await expect(desktop.plans.push(account.id, recreated, 3)).resolves.toEqual({
      status: "saved",
      revision: 4,
    });
    await expect(phone.plans.load(account.id)).resolves.toMatchObject({
      kind: "plan",
      plan: { revision: 4 },
    });

    await outsider.auth.registerWithEmail("outsider@example.test", password);
    await expect(outsider.plans.load(account.id)).rejects.toMatchObject({
      name: "RemotePlanReadError",
      kind: "unavailable",
    });

    await desktop.auth.signOut();
    expect(desktop.auth.currentAccount()).toBeNull();
    await expect(desktop.auth.signInWithEmail(email, password)).resolves.toMatchObject({
      id: account.id,
    });
  });
});
