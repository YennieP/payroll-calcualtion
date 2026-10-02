import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const distRoot = join(root, "dist");
const assetsRoot = join(distRoot, "assets");
const failures = [];

function bytes(path) {
  return statSync(path).size;
}

function gzipBytes(path) {
  return gzipSync(readFileSync(path)).byteLength;
}

function assertBudget(label, actual, maximum) {
  if (actual > maximum) failures.push(`${label} is ${actual} bytes; budget is ${maximum} bytes`);
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.") ? [path] : [];
  });
}

if (!existsSync(join(distRoot, "index.html")) || !existsSync(assetsRoot)) {
  console.error("Quality budgets require a completed production build.");
  process.exit(1);
}

const index = readFileSync(join(distRoot, "index.html"), "utf8");
const initialScripts = [...index.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((match) =>
  basename(match[1]),
);
if (initialScripts.length !== 1) {
  failures.push(`expected one initial module script, found ${initialScripts.length}`);
}

for (const script of initialScripts) {
  const path = join(assetsRoot, script);
  assertBudget("initial JavaScript", bytes(path), 325_000);
  assertBudget("initial JavaScript gzip", gzipBytes(path), 100_000);
}

const runtimeChunks = readdirSync(assetsRoot).filter((file) => /^runtime-.*\.js$/.test(file));
if (runtimeChunks.length !== 1) {
  failures.push(`expected one lazy Firebase runtime chunk, found ${runtimeChunks.length}`);
} else {
  const runtimeChunk = runtimeChunks[0];
  const path = join(assetsRoot, runtimeChunk);
  if (initialScripts.includes(runtimeChunk) || index.includes(runtimeChunk)) {
    failures.push("the Firebase runtime chunk is loaded by the anonymous initial page");
  }
  assertBudget("lazy Firebase runtime", bytes(path), 575_000);
  assertBudget("lazy Firebase runtime gzip", gzipBytes(path), 175_000);
}

const stylesheets = readdirSync(assetsRoot).filter((file) => /^index-.*\.css$/.test(file));
if (stylesheets.length !== 1) {
  failures.push(`expected one initial stylesheet, found ${stylesheets.length}`);
} else {
  const path = join(assetsRoot, stylesheets[0]);
  assertBudget("initial CSS", bytes(path), 40_000);
  assertBudget("initial CSS gzip", gzipBytes(path), 8_500);
}

const buildMaps = readdirSync(assetsRoot).filter((file) => file.endsWith(".map"));
if (buildMaps.length > 0)
  failures.push(`production source maps are present: ${buildMaps.join(", ")}`);

const fontRoot = join(distRoot, "fonts");
const fontManifestPath = join(fontRoot, "asset-manifest.json");
if (!existsSync(fontManifestPath)) {
  failures.push("the production font asset manifest is missing");
} else {
  const manifest = JSON.parse(readFileSync(fontManifestPath, "utf8"));
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const woff2Assets = assets.filter((path) => typeof path === "string" && path.endsWith(".woff2"));
  if (manifest.version !== 1 || woff2Assets.length !== 582) {
    failures.push(`font manifest expected 582 WOFF2 assets, found ${woff2Assets.length}`);
  }
  const totalFontBytes = assets.reduce((total, asset) => {
    const path = join(fontRoot, String(asset));
    return total + (existsSync(path) ? bytes(path) : 0);
  }, 0);
  assertBudget("complete idle-warmed font library", totalFontBytes, 21 * 1024 * 1024);
}

const runtimeSources = sourceFiles(join(root, "src"));
for (const path of runtimeSources) {
  const source = readFileSync(path, "utf8");
  if (/console\.(?:debug|info|log|warn|error)\s*\(/.test(source)) {
    failures.push(`${path.slice(root.length + 1)} contains production console logging`);
  }
}

const packageJson = readFileSync(join(root, "package.json"), "utf8");
if (/\b(?:analytics|mixpanel|segment|sentry)\b/i.test(packageJson)) {
  failures.push("package.json contains an unapproved analytics or tracking dependency");
}

const envExample = readFileSync(join(root, ".env.example"), "utf8");
for (const key of [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
]) {
  if (!new RegExp(`^${key}=$`, "m").test(envExample)) {
    failures.push(`${key} must remain blank in .env.example`);
  }
}

if (failures.length > 0) {
  console.error(`Quality budget checks failed:\n${failures.join("\n")}`);
  process.exit(1);
}

console.log(
  "Quality budgets passed: anonymous initial assets, lazy Firebase, complete idle-warmed fonts, source maps, runtime logging, tracking dependencies, and example Firebase values are bounded.",
);
