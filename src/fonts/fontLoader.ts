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

export type FontLibraryStatus = "idle" | "warming" | "ready" | "error";

export interface FontLibraryState {
  status: FontLibraryStatus;
  errorMessage: string | null;
  version: string;
}

const familyLoads = new Map<FontFamilyId, Promise<void>>();
const cachedFaceLoads = new Map<FontFamilyId, Promise<void>>();
const FONT_CACHE_PREFIX = "worthwhile-fonts-";
const FONT_CACHE_NAME = `${FONT_CACHE_PREFIX}${__FONT_ASSET_VERSION__}`;
const FONT_COMPLETE_MARKER = `.cache-complete-${__FONT_ASSET_VERSION__}`;
const fontLibraryListeners = new Set<() => void>();
let fontLibraryState: FontLibraryState = {
  status: "idle",
  errorMessage: null,
  version: __FONT_ASSET_VERSION__,
};
let warmupScheduled = false;
let warmupPromise: Promise<void> | null = null;

function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

function absoluteAssetUrl(path: string): string {
  return new URL(assetUrl(path), globalThis.location.href).href;
}

function versionedAssetUrl(path: string): string {
  const url = new URL(assetUrl(path), globalThis.location.href);
  url.searchParams.set("font-version", __FONT_ASSET_VERSION__);
  return url.href;
}

function updateFontLibraryState(next: FontLibraryState): void {
  fontLibraryState = next;
  for (const listener of fontLibraryListeners) listener();
}

export function getFontLibraryState(): FontLibraryState {
  return fontLibraryState;
}

export function subscribeFontLibraryState(listener: () => void): () => void {
  fontLibraryListeners.add(listener);
  return () => fontLibraryListeners.delete(listener);
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
    const cache = await globalThis.caches.open(FONT_CACHE_NAME);

    try {
      for (let index = 0; index < faces.length; index += 12) {
        const batch = await Promise.all(
          faces.slice(index, index + 12).map(async ({ url, descriptors }) => {
            const response = await cache.match(url);
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
  if (!("caches" in globalThis)) {
    throw new Error("This browser cannot store the complete font library offline.");
  }
  const manifestPath = "fonts/asset-manifest.json";
  const manifestUrl = absoluteAssetUrl(manifestPath);
  const markerUrl = absoluteAssetUrl(`fonts/${FONT_COMPLETE_MARKER}`);
  const cache = await globalThis.caches.open(FONT_CACHE_NAME);
  const completed = await cache.match(markerUrl);
  if (completed?.ok) {
    await deleteObsoleteFontCaches();
    return;
  }

  const manifestResponse = await fetch(versionedAssetUrl(manifestPath), { cache: "no-store" });
  if (!manifestResponse.ok) throw new Error("Failed to load the font asset manifest.");
  const manifestForCache = manifestResponse.clone();
  const manifest = (await manifestResponse.clone().json()) as {
    version?: unknown;
    assets?: unknown;
  };
  if (
    manifest.version !== __FONT_ASSET_VERSION__ ||
    !Array.isArray(manifest.assets) ||
    manifest.assets.length === 0 ||
    manifest.assets.some(
      (path) =>
        typeof path !== "string" ||
        path.startsWith("/") ||
        path.includes("..") ||
        !/\.(?:css|woff2)$/.test(path),
    )
  ) {
    throw new Error("The font asset manifest is invalid.");
  }

  const assets = manifest.assets as string[];
  if (new Set(assets).size !== assets.length) {
    throw new Error("The font asset manifest contains duplicate assets.");
  }

  await cache.put(manifestUrl, manifestForCache);
  const cachedUrls = new Set((await cache.keys()).map((request) => request.url));
  const missingAssets = assets.filter((path) => !cachedUrls.has(absoluteAssetUrl(`fonts/${path}`)));
  for (let index = 0; index < missingAssets.length; index += 16) {
    await Promise.all(
      missingAssets.slice(index, index + 16).map(async (path) => {
        const canonicalUrl = absoluteAssetUrl(`fonts/${path}`);
        const response = await fetch(versionedAssetUrl(`fonts/${path}`), { cache: "no-store" });
        if (!response.ok) throw new Error(`Failed to warm ${path}.`);
        await cache.put(canonicalUrl, response);
      }),
    );
  }

  const missingAfterWarmup = (
    await Promise.all(
      assets.map(async (path) =>
        (await cache.match(absoluteAssetUrl(`fonts/${path}`))) ? null : path,
      ),
    )
  ).filter((path): path is string => path !== null);
  if (missingAfterWarmup.length > 0) {
    throw new Error(`The font cache is incomplete: ${missingAfterWarmup[0]}.`);
  }

  await cache.put(
    markerUrl,
    new Response(__FONT_ASSET_VERSION__, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    }),
  );
  await deleteObsoleteFontCaches();
}

async function deleteObsoleteFontCaches(): Promise<void> {
  const cacheNames = await globalThis.caches.keys();
  await Promise.all(
    cacheNames
      .filter(
        (cacheName) => cacheName.startsWith(FONT_CACHE_PREFIX) && cacheName !== FONT_CACHE_NAME,
      )
      .map(async (cacheName) => {
        const deleted = await globalThis.caches.delete(cacheName);
        if (!deleted) throw new Error(`Failed to remove obsolete font cache ${cacheName}.`);
      }),
  );
}

function runFontWarmup(): Promise<void> {
  if (fontLibraryState.status === "ready") return Promise.resolve();
  if (warmupPromise) return warmupPromise;

  updateFontLibraryState({
    status: "warming",
    errorMessage: null,
    version: __FONT_ASSET_VERSION__,
  });
  warmupPromise = cacheAllFontAssets()
    .then(() => {
      updateFontLibraryState({
        status: "ready",
        errorMessage: null,
        version: __FONT_ASSET_VERSION__,
      });
    })
    .catch((error: unknown) => {
      updateFontLibraryState({
        status: "error",
        errorMessage:
          error instanceof Error
            ? error.message
            : "The complete font library could not be saved for offline use.",
        version: __FONT_ASSET_VERSION__,
      });
      throw error;
    })
    .finally(() => {
      warmupPromise = null;
    });
  return warmupPromise;
}

export function retryFontWarmup(): Promise<void> {
  return runFontWarmup();
}

export function startIdleFontWarmup(): void {
  if (fontLibraryState.status === "ready" || warmupPromise || warmupScheduled) return;
  warmupScheduled = true;
  const warm = () => {
    warmupScheduled = false;
    void runFontWarmup().catch(() => undefined);
  };

  if ("requestIdleCallback" in globalThis) {
    globalThis.requestIdleCallback(warm, { timeout: 4000 });
  } else {
    globalThis.setTimeout(warm, 1200);
  }
}
