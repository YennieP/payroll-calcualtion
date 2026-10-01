import { spawnSync } from "node:child_process";
import { delimiter, dirname, join } from "node:path";

const javaCandidates = [
  process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin", "java") : null,
  process.platform === "darwin" ? "/opt/homebrew/opt/openjdk@21/bin/java" : null,
  process.platform === "darwin" ? "/usr/local/opt/openjdk@21/bin/java" : null,
  "java",
].filter(Boolean);

const javaCommand = javaCandidates.find((candidate) => {
  const result = spawnSync(candidate, ["-version"], { stdio: "ignore" });
  return result.status === 0;
});

if (!javaCommand) {
  console.error(
    "Firebase Emulator requires Java 21. Set JAVA_HOME or install Homebrew openjdk@21.",
  );
  process.exit(1);
}

const javaBin = javaCommand.includes("/") ? dirname(javaCommand) : null;
const environment = {
  ...process.env,
  PATH: javaBin
    ? [javaBin, process.env.PATH ?? ""].filter(Boolean).join(delimiter)
    : process.env.PATH,
};
const firebaseCommand = process.platform === "win32" ? "firebase.cmd" : "firebase";
const result = spawnSync(
  firebaseCommand,
  [
    "emulators:exec",
    "--project",
    "demo-worthwhile-local",
    "--only",
    "auth,firestore",
    "vitest run --config vitest.firebase.config.ts && node scripts/checks/firebase-browser.mjs",
  ],
  {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(`Firebase Emulator could not start: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
