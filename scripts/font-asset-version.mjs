import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const FONT_CACHE_PREFIX = "worthwhile-fonts-";
export const FONT_ASSET_VERSION_PATTERN = /^[a-f0-9]{16}$/;

export function computeFontAssetVersion(fontRoot, assets) {
  const hash = createHash("sha256");
  for (const asset of [...assets].sort()) {
    hash.update(asset);
    hash.update("\0");
    hash.update(readFileSync(join(fontRoot, asset)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}
