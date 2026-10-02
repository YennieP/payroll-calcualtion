import { spawnSync } from "node:child_process";

const requestedMode = process.argv.includes("--mode")
  ? process.argv[process.argv.indexOf("--mode") + 1]
  : "full";

if (!new Set(["quick", "full"]).has(requestedMode)) {
  console.error(`Unknown verification mode: ${requestedMode ?? "missing"}`);
  process.exit(2);
}

const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 12)) {
  console.error(`Node.js 22.12 or newer is required. Current version: ${process.versions.node}`);
  process.exit(1);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const steps = [
  ["TypeScript", npmCommand, ["run", "typecheck"]],
  ["ESLint", npmCommand, ["run", "lint"]],
  ["Prettier", npmCommand, ["run", "format:check"]],
  ["Unit tests", npmCommand, ["test"]],
  ["Font assets", npmCommand, ["run", "fonts:check"]],
];

if (requestedMode === "full") {
  steps.push(
    ["Production build", npmCommand, ["run", "build"]],
    ["Quality and privacy budgets", npmCommand, ["run", "quality:check"]],
    ["Architecture boundaries", process.execPath, ["scripts/checks/architecture-boundaries.mjs"]],
    ["PWA artifacts", process.execPath, ["scripts/checks/pwa-artifacts.mjs"]],
    ["PWA offline browser", npmCommand, ["run", "test:pwa:browser"]],
    ["Browser font audit", npmCommand, ["run", "test:fonts:browser"]],
    ["Extreme-content and accessibility browser", npmCommand, ["run", "test:quality:browser"]],
    ["Firebase Emulator", npmCommand, ["run", "test:firebase:emulator"]],
    ["Project documents", process.execPath, ["scripts/checks/project-docs.mjs"]],
  );
}

console.log(`Running ${requestedMode} local verification with Node.js ${process.versions.node}.`);

for (const [label, command, args] of steps) {
  console.log(`\n[verify] ${label}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`[verify] ${label} could not start: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[verify] ${label} failed with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\n[verify] ${requestedMode} verification passed.`);
