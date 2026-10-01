import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

import type { CloudRuntime } from "../../ports/CloudRuntime";
import type { FirebaseRuntimeConfig } from "./config";
import { FirebaseAuthProvider } from "./FirebaseAuthProvider";
import { FirebasePlanRepository } from "./FirebasePlanRepository";

const APP_NAME = "worthwhile-web";

export async function createFirebaseRuntime(
  runtimeConfig: FirebaseRuntimeConfig,
): Promise<CloudRuntime> {
  const existingApp = getApps().find((candidate) => candidate.name === APP_NAME);
  const app = existingApp ?? initializeApp(runtimeConfig.client, APP_NAME);
  const auth = getAuth(app);
  const firestore = getFirestore(getApp(APP_NAME));

  if (runtimeConfig.emulators) {
    connectAuthEmulator(auth, runtimeConfig.emulators.authUrl, { disableWarnings: true });
    connectFirestoreEmulator(
      firestore,
      runtimeConfig.emulators.firestoreHost,
      runtimeConfig.emulators.firestorePort,
    );
  }

  await setPersistence(auth, browserLocalPersistence);
  return {
    auth: new FirebaseAuthProvider(auth),
    plans: new FirebasePlanRepository(firestore),
  };
}
