import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredArtifacts = ["dist/index.html", "dist/manifest.webmanifest", "dist/sw.js"];
const missing = requiredArtifacts.filter((path) => !existsSync(join(root, path)));

if (missing.length > 0) {
  console.error(`Missing PWA build artifacts:\n${missing.join("\n")}`);
  process.exit(1);
}

const index = readFileSync(join(root, "dist/index.html"), "utf8");
if (!index.includes("/payroll-calcualtion/")) {
  console.error("Production HTML does not use the GitHub repository base path.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(root, "dist/manifest.webmanifest"), "utf8"));
if (
  manifest.name !== "Worthwhile · California Income Planner" ||
  manifest.display !== "standalone"
) {
  console.error("PWA manifest is missing the expected product name or standalone display mode.");
  process.exit(1);
}

const serviceWorker = readFileSync(join(root, "dist/sw.js"), "utf8");
const acceptedFontDirectories = [
  "bodoni-moda",
  "zcool-xiaowei",
  "cormorant-garamond",
  "zhuque-fangsong",
  "dm-serif-display",
  "space-grotesk",
  "zcool-qingke-huangyou",
  "cinzel",
  "ma-shan-zheng",
  "libre-caslon-display",
  "long-cang",
];
if (
  !serviceWorker.includes(".woff2") ||
  acceptedFontDirectories.some((directory) => !serviceWorker.includes(`fonts/${directory}/`))
) {
  console.error("PWA precache does not include the self-hosted font packages.");
  process.exit(1);
}

const distFontRoot = join(root, "dist", "fonts");
if (!existsSync(distFontRoot)) {
  console.error("Production build is missing the self-hosted font directory.");
  process.exit(1);
}

for (const directory of acceptedFontDirectories) {
  if (!existsSync(join(distFontRoot, directory, "font.css"))) {
    console.error(`Production build is missing fonts/${directory}/font.css.`);
    process.exit(1);
  }
}

console.log("PWA build artifacts passed.");
