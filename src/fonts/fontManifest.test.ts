import { describe, expect, it } from "vitest";

import type { ThemeId } from "../domain/plan";
import { THEME_OPTIONS } from "../features/planner/themeOptions";
import {
  ALL_FONT_FAMILY_IDS,
  FONT_FAMILIES,
  THEME_FONT_FAMILIES,
  THEME_TYPOGRAPHY,
  UNCOMMON_CHINESE_FONT_SAMPLE,
} from "./fontManifest";

describe("font manifest", () => {
  it("maps every accepted theme to versioned local font assets", () => {
    const themeIds = THEME_OPTIONS.map((theme) => theme.id);
    expect(Object.keys(THEME_FONT_FAMILIES)).toEqual(themeIds);
    expect(Object.keys(THEME_TYPOGRAPHY)).toEqual(themeIds);

    for (const themeId of themeIds as ThemeId[]) {
      expect(THEME_FONT_FAMILIES[themeId].length).toBeGreaterThanOrEqual(2);
      for (const familyId of THEME_FONT_FAMILIES[themeId]) {
        const family = FONT_FAMILIES[familyId];
        expect(family.stylesheet).toMatch(/^fonts\/.+\/font\.css$/);
        expect(family.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(family.license).toBe("OFL-1.1");
      }
    }
  });

  it("checks common and uncommon glyphs for every Chinese family", () => {
    const chineseFamilies = ALL_FONT_FAMILY_IDS.filter((familyId) =>
      [
        "zcool-xiaowei",
        "zhuque-fangsong",
        "zcool-qingke-huangyou",
        "ma-shan-zheng",
        "long-cang",
      ].includes(familyId),
    );

    for (const familyId of chineseFamilies) {
      const samples = FONT_FAMILIES[familyId].coverageChecks.map((check) => check.sample);
      expect(samples).toContain(UNCOMMON_CHINESE_FONT_SAMPLE);
    }
  });

  it("keeps italic display coverage for both opera themes", () => {
    for (const familyId of ["bodoni-moda", "cormorant-garamond"] as const) {
      expect(FONT_FAMILIES[familyId].coverageChecks).toContainEqual(
        expect.objectContaining({ style: "italic", weight: 500 }),
      );
    }
  });

  it("uses each accepted family in no more than two themes", () => {
    const familyThemeCounts = new Map<string, number>();
    for (const familyIds of Object.values(THEME_FONT_FAMILIES)) {
      for (const familyId of new Set(familyIds)) {
        familyThemeCounts.set(familyId, (familyThemeCounts.get(familyId) ?? 0) + 1);
      }
    }

    for (const [familyId, count] of familyThemeCounts) {
      expect(count, familyId).toBeLessThanOrEqual(2);
    }
  });

  it("keeps the approved Blue Midnight number exception and removes rejected families", () => {
    expect(THEME_TYPOGRAPHY.midnight.number).toBe("DM Serif Display");
    expect(THEME_FONT_FAMILIES.midnight).toContain("dm-serif-display");

    const serializedManifest = JSON.stringify({ FONT_FAMILIES, THEME_TYPOGRAPHY });
    for (const rejectedFamily of [
      "Noto Sans SC",
      "IBM Plex Sans SC",
      "Manrope",
      "LXGW WenKai",
      "WenJin Mincho",
      "Noto Serif SC",
    ]) {
      expect(serializedManifest).not.toContain(rejectedFamily);
    }
  });
});
