import { parseFirebaseRuntimeConfig } from "../adapters/firebase/config";
import type { CloudRuntime } from "../ports/CloudRuntime";

let runtimePromise: Promise<CloudRuntime | null> | null = null;

export function loadFirebaseRuntime(): Promise<CloudRuntime | null> {
  runtimePromise ??= (async () => {
    const config = parseFirebaseRuntimeConfig({
      VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
      VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
      VITE_FIREBASE_USE_EMULATORS: import.meta.env.VITE_FIREBASE_USE_EMULATORS,
      VITE_FIREBASE_AUTH_EMULATOR_URL: import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL,
      VITE_FIRESTORE_EMULATOR_HOST: import.meta.env.VITE_FIRESTORE_EMULATOR_HOST,
      VITE_FIRESTORE_EMULATOR_PORT: import.meta.env.VITE_FIRESTORE_EMULATOR_PORT,
    });
    if (!config) return null;
    const { createFirebaseRuntime } = await import("../adapters/firebase/runtime");
    return createFirebaseRuntime(config);
  })();
  return runtimePromise;
}
