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
  manifest.display !== "standalone" ||
  manifest.start_url !== "./"
) {
  console.error("PWA manifest is missing the expected identity, start URL, or display mode.");
  process.exit(1);
}

const requiredIcons = [
  ["icons/app-icon-192.png", "192x192", "any"],
  ["icons/app-icon-512.png", "512x512", "any"],
  ["icons/app-icon-512.png", "512x512", "maskable"],
];
for (const [src, sizes, purpose] of requiredIcons) {
  if (
    !manifest.icons?.some(
      (icon) => icon.src === src && icon.sizes === sizes && icon.purpose === purpose,
    ) ||
    !existsSync(join(root, "dist", src))
  ) {
    console.error(`PWA install icon ${src} (${sizes}, ${purpose}) is missing.`);
    process.exit(1);
  }
}

if (!index.includes("viewport-fit=cover") || !index.includes("apple-touch-icon")) {
  console.error("Production HTML is missing standalone safe-area or Apple install metadata.");
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
  !serviceWorker.includes("icons/app-icon-192.png") ||
  !serviceWorker.includes("icons/app-icon-512.png") ||
  !serviceWorker.includes("fonts/asset-manifest.json")
) {
  console.error("PWA precache does not include install icons and the font asset manifest.");
  process.exit(1);
}

if (
  !serviceWorker.includes("worthwhile-fonts-v1") ||
  acceptedFontDirectories.some((directory) => serviceWorker.includes(`fonts/${directory}/`))
) {
  console.error(
    "Font packages must use the idle-warmed runtime cache instead of the install-time precache.",
  );
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

if (!existsSync(join(distFontRoot, "asset-manifest.json"))) {
  console.error("Production build is missing fonts/asset-manifest.json.");
  process.exit(1);
}

console.log("PWA build artifacts passed.");
