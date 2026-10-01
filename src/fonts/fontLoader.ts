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
        const loadedFaces = await document.fonts.load(shorthand, sample);
        const passed =
          loadedFaces.length > 0 &&
          document.fonts.check(shorthand, sample) &&
          hasDistinctRasterization(manifest.family, check, sample);
        return { passed, sample };
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

export async function loadFontFamilies(
  familyIds: readonly FontFamilyId[],
): Promise<FontLoadResult> {
  const uniqueFamilyIds = [...new Set(familyIds)];
  await Promise.all(uniqueFamilyIds.map(loadStylesheet));
  const audits = await Promise.all(uniqueFamilyIds.map(auditFamily));
  return { familyIds: uniqueFamilyIds, failures: audits.flat() };
}

export function loadThemeFonts(themeId: ThemeId): Promise<FontLoadResult> {
  return loadFontFamilies(THEME_FONT_FAMILIES[themeId]);
}

export function loadAllFonts(): Promise<FontLoadResult> {
  return loadFontFamilies(ALL_FONT_FAMILY_IDS);
}

export function startIdleFontWarmup(activeThemeId: ThemeId): void {
  if (warmupStarted) return;
  warmupStarted = true;
  const activeFamilies = new Set(THEME_FONT_FAMILIES[activeThemeId]);
  const remaining = ALL_FONT_FAMILY_IDS.filter((familyId) => !activeFamilies.has(familyId));
  const warm = () => void loadFontFamilies(remaining).catch(() => undefined);

  if ("requestIdleCallback" in globalThis) {
    globalThis.requestIdleCallback(warm, { timeout: 4000 });
  } else {
    globalThis.setTimeout(warm, 1200);
  }
}
