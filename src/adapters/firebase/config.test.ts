import { describe, expect, it } from "vitest";

import { parseFirebaseRuntimeConfig } from "./config";

const COMPLETE_CONFIG = {
  VITE_FIREBASE_API_KEY: "public-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "demo.example.test",
  VITE_FIREBASE_PROJECT_ID: "worthwhile-demo",
  VITE_FIREBASE_APP_ID: "app-id",
};

describe("Firebase runtime configuration", () => {
  it("keeps the app in anonymous local mode when Firebase is unconfigured", () => {
    expect(parseFirebaseRuntimeConfig({})).toBeNull();
  });

  it("rejects partial configuration instead of silently using a broken cloud mode", () => {
    expect(() => parseFirebaseRuntimeConfig({ VITE_FIREBASE_API_KEY: "only-one-value" })).toThrow(
      /partial/,
    );
  });

  it("builds explicit local emulator endpoints", () => {
    expect(
      parseFirebaseRuntimeConfig({
        ...COMPLETE_CONFIG,
        VITE_FIREBASE_USE_EMULATORS: "true",
        VITE_FIRESTORE_EMULATOR_PORT: "8180",
      }),
    ).toMatchObject({
      client: { projectId: "worthwhile-demo" },
      emulators: {
        authUrl: "http://127.0.0.1:9099",
        firestoreHost: "127.0.0.1",
        firestorePort: 8180,
      },
    });
  });
});
