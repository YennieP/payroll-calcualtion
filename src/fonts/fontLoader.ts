import type { ThemeId } from "../domain/plan";
import {
  ALL_FONT_FAMILY_IDS,
  FONT_FAMILIES,
  THEME_FONT_FAMILIES,
  type FontCoverageCheck,
  type FontFamilyId,
} from "./fontManifest";

export interface FontAuditFailure {
  familyId: FontFamilyId;
  family: string;
  label: string;
  sample: string;
}

export interface FontLoadResult {
  familyIds: readonly FontFamilyId[];
  failures: readonly FontAuditFailure[];
}

const familyLoads = new Map<FontFamilyId, Promise<void>>();
const cachedFaceLoads = new Map<FontFamilyId, Promise<void>>();
const FONT_CACHE_NAME = "worthwhile-fonts-v1";
let warmupStarted = false;

function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

function loadStylesheet(familyId: FontFamilyId): Promise<void> {
  const cached = familyLoads.get(familyId);
  if (cached) return cached;

  const manifest = FONT_FAMILIES[familyId];
  const load = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLLinkElement>(
      `link[data-font-family="${familyId}"]`,
    );
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }

    const link = existing ?? document.createElement("link");
    link.rel = "stylesheet";
    link.href = assetUrl(manifest.stylesheet);
    link.dataset.fontFamily = familyId;
    link.addEventListener(
      "load",
      () => {
        link.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    link.addEventListener(
      "error",
      () => {
        link.remove();
        reject(new Error(`Failed to load ${manifest.family} stylesheet.`));
      },
      { once: true },
    );
    if (!existing) document.head.append(link);
  });

  const retriableLoad = load.catch((error: unknown) => {
    familyLoads.delete(familyId);
    throw error;
  });
  familyLoads.set(familyId, retriableLoad);
  return retriableLoad;
}

function fontShorthand(family: string, check: FontCoverageCheck): string {
  return `${check.style ?? "normal"} ${check.weight} 32px "${family}"`;
}

function hasDistinctRasterization(
  family: string,
  check: FontCoverageCheck,
  sample: string,
): boolean {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 96;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return true;

  const render = (font: string): Uint8ClampedArray => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#000";
    context.font = font;
    context.textBaseline = "top";
    context.fillText(sample, 4, 4);
    return context.getImageData(0, 0, canvas.width, canvas.height).data.slice();
  };

  const prefix = `${check.style ?? "normal"} ${check.weight} 48px`;
  const expected = render(`${prefix} "${family}", monospace`);
  const fallback = render(`${prefix} monospace`);
  return expected.some((channel, index) => channel !== fallback[index]);
}

async function auditFamily(familyId: FontFamilyId): Promise<FontAuditFailure[]> {
  if (!document.fonts) return [];
  const manifest = FONT_FAMILIES[familyId];
  const failures: FontAuditFailure[] = [];

  for (const check of manifest.coverageChecks) {
    const shorthand = fontShorthand(manifest.family, check);
    const samples = check.label.includes("Chinese")
      ? [...new Set([...check.sample].filter((character) => character.trim()))]
      : [check.sample];
    const results = await Promise.all(
      samples.map(async (sample) => {
        try {
          const loadedFaces = await document.fonts.load(shorthand, sample);
          const passed =
            loadedFaces.length > 0 &&
            document.fonts.check(shorthand, sample) &&
            hasDistinctRasterization(manifest.family, check, sample);
          return { passed, sample };
        } catch {
          return { passed: false, sample };
        }
      }),
    );
    failures.push(
      ...results
        .filter((result) => !result.passed)
        .map((result) => ({
          familyId,
          family: manifest.family,
          label: check.label,
          sample: result.sample,
        })),
    );
  }

  return failures;
}

function fontFaceDescriptors(style: CSSStyleDeclaration): FontFaceDescriptors {
  const fontStyle = style.getPropertyValue("font-style").trim();
  const weight = style.getPropertyValue("font-weight").trim();
  const stretch = style.getPropertyValue("font-stretch").trim();
  const unicodeRange = style.getPropertyValue("unicode-range").trim();
  const featureSettings = style.getPropertyValue("font-feature-settings").trim();
  return {
    ...(fontStyle ? { style: fontStyle } : {}),
    ...(weight ? { weight } : {}),
    ...(stretch ? { stretch } : {}),
    ...(unicodeRange ? { unicodeRange } : {}),
    ...(featureSettings ? { featureSettings } : {}),
  };
}

function stylesheetFontFaces(familyId: FontFamilyId) {
  const link = document.querySelector<HTMLLinkElement>(`link[data-font-family="${familyId}"]`);
  if (!link?.sheet) throw new Error(`The ${familyId} font stylesheet is unavailable.`);

  const faces = [...link.sheet.cssRules]
    .filter((rule): rule is CSSFontFaceRule => rule.type === CSSRule.FONT_FACE_RULE)
    .map((rule) => {
      const source = rule.style.getPropertyValue("src");
      const match = /url\((?:"([^"]+)"|'([^']+)'|([^)'"\s]+))\)/.exec(source);
      const relativeUrl = match?.[1] ?? match?.[2] ?? match?.[3];
      if (!relativeUrl) throw new Error(`The ${familyId} font source is invalid.`);
      return {
        url: new URL(relativeUrl, link.href).href,
        descriptors: fontFaceDescriptors(rule.style),
      };
    });
  if (faces.length === 0) throw new Error(`The ${familyId} font stylesheet has no faces.`);
  return { faces, link };
}

async function loadFamilyFromCache(familyId: FontFamilyId): Promise<void> {
  const cached = cachedFaceLoads.get(familyId);
  if (cached) return cached;

  const load = (async () => {
    if (!("caches" in globalThis) || !("FontFace" in globalThis)) {
      throw new Error("Cached font loading is unavailable in this browser.");
    }
    const manifest = FONT_FAMILIES[familyId];
    const { faces, link } = stylesheetFontFaces(familyId);
    const registeredFaces: FontFace[] = [];

    try {
      for (let index = 0; index < faces.length; index += 12) {
        const batch = await Promise.all(
          faces.slice(index, index + 12).map(async ({ url, descriptors }) => {
            const response = await globalThis.caches.match(url);
            if (!response?.ok) throw new Error(`The cached font asset is missing: ${url}`);
            const face = new FontFace(manifest.family, await response.arrayBuffer(), descriptors);
            return face.load();
          }),
        );
        for (const face of batch) {
          document.fonts.add(face);
          registeredFaces.push(face);
        }
      }
      link.remove();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    } catch (error) {
      for (const face of registeredFaces) document.fonts.delete(face);
      throw error;
    }
  })();

  const retriableLoad = load.catch((error: unknown) => {
    cachedFaceLoads.delete(familyId);
    throw error;
  });
  cachedFaceLoads.set(familyId, retriableLoad);
  return retriableLoad;
}

export async function loadFontFamilies(
  familyIds: readonly FontFamilyId[],
): Promise<FontLoadResult> {
  const uniqueFamilyIds = [...new Set(familyIds)];
  await Promise.all(uniqueFamilyIds.map(loadStylesheet));
  let audits = await Promise.all(uniqueFamilyIds.map(auditFamily));
  const failedFamilyIds = uniqueFamilyIds.filter((_, index) => audits[index].length > 0);
  if (failedFamilyIds.length > 0 && "caches" in globalThis) {
    await Promise.all(failedFamilyIds.map(loadFamilyFromCache));
    audits = await Promise.all(uniqueFamilyIds.map(auditFamily));
  }
  return { familyIds: uniqueFamilyIds, failures: audits.flat() };
}

export function loadThemeFonts(themeId: ThemeId): Promise<FontLoadResult> {
  return loadFontFamilies(THEME_FONT_FAMILIES[themeId]);
}

export function loadAllFonts(): Promise<FontLoadResult> {
  return loadFontFamilies(ALL_FONT_FAMILY_IDS);
}

export async function cacheAllFontAssets(): Promise<void> {
  if (!("caches" in globalThis)) return;
  const manifestUrl = assetUrl("fonts/asset-manifest.json");
  const cache = await globalThis.caches.open(FONT_CACHE_NAME);
  const cachedManifest = await cache.match(manifestUrl);
  const manifestResponse = cachedManifest ?? (await fetch(manifestUrl));
  if (!manifestResponse.ok) throw new Error("Failed to load the font asset manifest.");
  const manifest = (await manifestResponse.clone().json()) as {
    version?: unknown;
    assets?: unknown;
  };
  if (manifest.version !== 1 || !Array.isArray(manifest.assets)) {
    throw new Error("The font asset manifest is invalid.");
  }

  if (!cachedManifest) await cache.put(manifestUrl, manifestResponse);
  const assets = manifest.assets.filter((path): path is string => typeof path === "string");
  const cachedUrls = new Set((await cache.keys()).map((request) => request.url));
  const missingAssets = assets.filter((path) => !cachedUrls.has(assetUrl(`fonts/${path}`)));
  for (let index = 0; index < missingAssets.length; index += 16) {
    await Promise.all(
      missingAssets.slice(index, index + 16).map(async (path) => {
        const url = assetUrl(`fonts/${path}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to warm ${path}.`);
        await cache.put(url, response);
      }),
    );
  }
}

export function startIdleFontWarmup(activeThemeId: ThemeId): void {
  if (warmupStarted) return;
  warmupStarted = true;
  const activeFamilies = new Set(THEME_FONT_FAMILIES[activeThemeId]);
  const remaining = ALL_FONT_FAMILY_IDS.filter((familyId) => !activeFamilies.has(familyId));
  const warm = () =>
    void Promise.all([loadFontFamilies(remaining), cacheAllFontAssets()]).catch(() => undefined);

  if ("requestIdleCallback" in globalThis) {
    globalThis.requestIdleCallback(warm, { timeout: 4000 });
  } else {
    globalThis.setTimeout(warm, 1200);
  }
}
