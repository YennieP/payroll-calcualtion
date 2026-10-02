import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { afterAll, describe, expect, it } from "vitest";

import { FirebaseAuthProvider } from "../../src/adapters/firebase/FirebaseAuthProvider";
import { FirebasePlanRepository } from "../../src/adapters/firebase/FirebasePlanRepository";
import { createSamplePlan } from "../../src/application/samplePlan";

const PROJECT_ID = "demo-worthwhile-local";
const EMULATOR_CONFIG = {
  apiKey: "demo-key",
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  appId: "1:123456789:web:123456789",
};

const apps: FirebaseApp[] = [];

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

afterAll(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)));
});

describe("Firebase adapters across independent contexts", () => {
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
      code: "permission-denied",
    });

    await desktop.auth.signOut();
    expect(desktop.auth.currentAccount()).toBeNull();
    await expect(desktop.auth.signInWithEmail(email, password)).resolves.toMatchObject({
      id: account.id,
    });
  });
});
