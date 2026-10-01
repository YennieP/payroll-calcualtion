export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export interface FirebaseEmulatorConfig {
  authUrl: string;
  firestoreHost: string;
  firestorePort: number;
}

export interface FirebaseRuntimeConfig {
  client: FirebaseClientConfig;
  emulators: FirebaseEmulatorConfig | null;
}

interface FirebaseEnvironment {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_FIREBASE_USE_EMULATORS?: string;
  VITE_FIREBASE_AUTH_EMULATOR_URL?: string;
  VITE_FIRESTORE_EMULATOR_HOST?: string;
  VITE_FIRESTORE_EMULATOR_PORT?: string;
}

function readRequiredFirebaseValues(environment: FirebaseEnvironment) {
  return [
    environment.VITE_FIREBASE_API_KEY?.trim() ?? "",
    environment.VITE_FIREBASE_AUTH_DOMAIN?.trim() ?? "",
    environment.VITE_FIREBASE_PROJECT_ID?.trim() ?? "",
    environment.VITE_FIREBASE_APP_ID?.trim() ?? "",
  ] as const;
}

export function parseFirebaseRuntimeConfig(
  environment: FirebaseEnvironment,
): FirebaseRuntimeConfig | null {
  const [apiKey, authDomain, projectId, appId] = readRequiredFirebaseValues(environment);
  const configuredCount = [apiKey, authDomain, projectId, appId].filter(Boolean).length;
  if (configuredCount === 0) return null;
  if (configuredCount !== 4) {
    throw new Error("Firebase configuration is partial; provide all four VITE_FIREBASE_* values.");
  }

  const useEmulators = environment.VITE_FIREBASE_USE_EMULATORS === "true";
  const firestorePort = Number(environment.VITE_FIRESTORE_EMULATOR_PORT ?? "8080");
  if (useEmulators && (!Number.isInteger(firestorePort) || firestorePort <= 0)) {
    throw new Error("VITE_FIRESTORE_EMULATOR_PORT must be a positive integer.");
  }

  return {
    client: { apiKey, authDomain, projectId, appId },
    emulators: useEmulators
      ? {
          authUrl: environment.VITE_FIREBASE_AUTH_EMULATOR_URL ?? "http://127.0.0.1:9099",
          firestoreHost: environment.VITE_FIRESTORE_EMULATOR_HOST ?? "127.0.0.1",
          firestorePort,
        }
      : null,
  };
}
