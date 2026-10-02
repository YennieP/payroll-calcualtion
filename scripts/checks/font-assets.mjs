import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { computeFontAssetVersion, FONT_ASSET_VERSION_PATTERN } from "../font-asset-version.mjs";

const root = process.cwd();
const fontRoot = join(root, "public", "fonts");
const expected = {
  "bodoni-moda": "Bodoni Moda",
  "zcool-xiaowei": "ZCOOL XiaoWei",
  "cormorant-garamond": "Cormorant Garamond",
  "zhuque-fangsong": "Zhuque Fangsong",
  "dm-serif-display": "DM Serif Display",
  "space-grotesk": "Space Grotesk",
  "zcool-qingke-huangyou": "ZCOOL QingKe HuangYou",
  cinzel: "Cinzel",
  "ma-shan-zheng": "Ma Shan Zheng",
  "libre-caslon-display": "Libre Caslon Display",
  "long-cang": "Long Cang",
};

const failures = [];
const actualDirectories = readdirSync(fontRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const expectedDirectories = Object.keys(expected).sort();

if (actualDirectories.join("\n") !== expectedDirectories.join("\n")) {
  failures.push(
    `font directories differ from the accepted manifest\nexpected: ${expectedDirectories.join(", ")}\nactual: ${actualDirectories.join(", ")}`,
  );
}

let totalWoff2Files = 0;
const expectedCachedAssets = [];
for (const [directory, family] of Object.entries(expected)) {
  const familyRoot = join(fontRoot, directory);
  const stylesheetPath = join(familyRoot, "font.css");
  const licensePath = join(familyRoot, "OFL-1.1.txt");
  if (!existsSync(stylesheetPath) || !existsSync(licensePath)) {
    failures.push(`${directory} is missing font.css or OFL-1.1.txt`);
    continue;
  }

  const stylesheet = readFileSync(stylesheetPath, "utf8");
  if (!stylesheet.includes(`font-family: '${family}'`)) {
    failures.push(`${directory} does not declare the expected family name`);
  }
  if (/\.woff(['")])/.test(stylesheet)) {
    failures.push(`${directory} contains a non-WOFF2 source`);
  }

  const woff2Files = readdirSync(familyRoot)
    .filter((file) => file.endsWith(".woff2"))
    .sort();
  const references = [
    ...new Set(
      [...stylesheet.matchAll(/url\((?:['"])?\.\/([^'")]+\.woff2)(?:['"])?\)/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort();
  totalWoff2Files += woff2Files.length;
  expectedCachedAssets.push(
    `${directory}/font.css`,
    ...woff2Files.map((file) => `${directory}/${file}`),
  );

  if (woff2Files.length === 0) failures.push(`${directory} has no WOFF2 files`);
  if (woff2Files.join("\n") !== references.join("\n")) {
    failures.push(`${directory} assets and stylesheet references differ`);
  }
  for (const reference of references) {
    if (!existsSync(join(familyRoot, reference))) {
      failures.push(`${directory}/font.css references missing ${reference}`);
    }
  }
}

const assetManifestPath = join(fontRoot, "asset-manifest.json");
if (!existsSync(assetManifestPath)) {
  failures.push("font asset-manifest.json is missing");
} else {
  const assetManifest = JSON.parse(readFileSync(assetManifestPath, "utf8"));
  const actualCachedAssets = Array.isArray(assetManifest.assets)
    ? [...assetManifest.assets].sort()
    : [];
  const expectedVersion = computeFontAssetVersion(fontRoot, expectedCachedAssets);
  if (
    typeof assetManifest.version !== "string" ||
    !FONT_ASSET_VERSION_PATTERN.test(assetManifest.version) ||
    assetManifest.version !== expectedVersion ||
    actualCachedAssets.join("\n") !== expectedCachedAssets.sort().join("\n")
  ) {
    failures.push(
      "font asset-manifest.json version or asset list does not match the accepted CSS and WOFF2 content",
    );
  }
}

if (failures.length > 0) {
  console.error(`Font asset checks failed:\n${failures.join("\n")}`);
  process.exit(1);
}

console.log(
  `Pinned WOFF2 assets and licenses passed for ${expectedDirectories.length} families (${totalWoff2Files} files).`,
);
