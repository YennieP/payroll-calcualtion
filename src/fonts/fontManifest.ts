import type { ThemeId } from "../domain/plan";

export type FontFamilyId =
  | "bodoni-moda"
  | "zcool-xiaowei"
  | "cormorant-garamond"
  | "zhuque-fangsong"
  | "dm-serif-display"
  | "space-grotesk"
  | "zcool-qingke-huangyou"
  | "cinzel"
  | "ma-shan-zheng"
  | "libre-caslon-display"
  | "long-cang";

export interface FontCoverageCheck {
  weight: 400 | 500;
  style?: "normal" | "italic";
  sample: string;
  label: string;
}

export interface FontFamilyManifest {
  id: FontFamilyId;
  family: string;
  stylesheet: string;
  version: string;
  license: "OFL-1.1";
  coverageChecks: readonly FontCoverageCheck[];
}

const LATIN_SAMPLE = "Worthwhile California 0123456789";
export const COMMON_CHINESE_FONT_SAMPLE = "每月生活目标与收入计划";
export const UNCOMMON_CHINESE_FONT_SAMPLE = "龘麤爨籲龜鬱";

const latinChecks = (italic = false): readonly FontCoverageCheck[] => [
  { weight: 400, sample: LATIN_SAMPLE, label: "Latin regular" },
  ...(italic
    ? ([
        {
          weight: 500,
          style: "italic",
          sample: LATIN_SAMPLE,
          label: "Latin medium italic",
        },
      ] as const)
    : []),
];

const chineseChecks = (): readonly FontCoverageCheck[] => [
  { weight: 400, sample: COMMON_CHINESE_FONT_SAMPLE, label: "common Chinese regular" },
  { weight: 400, sample: UNCOMMON_CHINESE_FONT_SAMPLE, label: "uncommon Chinese regular" },
];

export const FONT_FAMILIES: Readonly<Record<FontFamilyId, FontFamilyManifest>> = {
  "bodoni-moda": {
    id: "bodoni-moda",
    family: "Bodoni Moda",
    stylesheet: "fonts/bodoni-moda/font.css",
    version: "5.3.0",
    license: "OFL-1.1",
    coverageChecks: latinChecks(true),
  },
  "zcool-xiaowei": {
    id: "zcool-xiaowei",
    family: "ZCOOL XiaoWei",
    stylesheet: "fonts/zcool-xiaowei/font.css",
    version: "5.3.0",
    license: "OFL-1.1",
    coverageChecks: chineseChecks(),
  },
  "cormorant-garamond": {
    id: "cormorant-garamond",
    family: "Cormorant Garamond",
    stylesheet: "fonts/cormorant-garamond/font.css",
    version: "5.3.0",
    license: "OFL-1.1",
    coverageChecks: latinChecks(true),
  },
  "zhuque-fangsong": {
    id: "zhuque-fangsong",
    family: "Zhuque Fangsong",
    stylesheet: "fonts/zhuque-fangsong/font.css",
    version: "1.0.0",
    license: "OFL-1.1",
    coverageChecks: chineseChecks(),
  },
  "dm-serif-display": {
    id: "dm-serif-display",
    family: "DM Serif Display",
    stylesheet: "fonts/dm-serif-display/font.css",
    version: "5.3.0",
    license: "OFL-1.1",
    coverageChecks: latinChecks(),
  },
  "space-grotesk": {
    id: "space-grotesk",
    family: "Space Grotesk",
    stylesheet: "fonts/space-grotesk/font.css",
    version: "5.3.0",
    license: "OFL-1.1",
    coverageChecks: latinChecks(),
  },
  "zcool-qingke-huangyou": {
    id: "zcool-qingke-huangyou",
    family: "ZCOOL QingKe HuangYou",
    stylesheet: "fonts/zcool-qingke-huangyou/font.css",
    version: "5.3.0",
    license: "OFL-1.1",
    coverageChecks: chineseChecks(),
  },
  cinzel: {
    id: "cinzel",
    family: "Cinzel",
    stylesheet: "fonts/cinzel/font.css",
    version: "5.3.0",
    license: "OFL-1.1",
    coverageChecks: latinChecks(),
  },
  "ma-shan-zheng": {
    id: "ma-shan-zheng",
    family: "Ma Shan Zheng",
    stylesheet: "fonts/ma-shan-zheng/font.css",
    version: "5.3.1",
    license: "OFL-1.1",
    coverageChecks: chineseChecks(),
  },
  "libre-caslon-display": {
    id: "libre-caslon-display",
    family: "Libre Caslon Display",
    stylesheet: "fonts/libre-caslon-display/font.css",
    version: "5.3.0",
    license: "OFL-1.1",
    coverageChecks: latinChecks(),
  },
  "long-cang": {
    id: "long-cang",
    family: "Long Cang",
    stylesheet: "fonts/long-cang/font.css",
    version: "5.3.0",
    license: "OFL-1.1",
    coverageChecks: chineseChecks(),
  },
};

export const THEME_FONT_FAMILIES: Readonly<Record<ThemeId, readonly FontFamilyId[]>> = {
  rouge: ["bodoni-moda", "zcool-xiaowei"],
  midnight: ["cormorant-garamond", "zhuque-fangsong", "dm-serif-display"],
  "violet-amber": ["space-grotesk", "zcool-qingke-huangyou"],
  "violet-crimson": ["cinzel", "ma-shan-zheng"],
  "violet-blue": ["space-grotesk", "zcool-qingke-huangyou"],
  "gold-opera": ["cormorant-garamond", "zhuque-fangsong"],
  "scarlet-opera": ["libre-caslon-display", "long-cang"],
};

export interface ThemeTypography {
  body: string;
  display: string;
  number: string;
}

export const THEME_TYPOGRAPHY: Readonly<Record<ThemeId, ThemeTypography>> = {
  rouge: {
    body: "Bodoni Moda + ZCOOL XiaoWei",
    display: "Bodoni Moda + ZCOOL XiaoWei",
    number: "Bodoni Moda",
  },
  midnight: {
    body: "Cormorant Garamond + Zhuque Fangsong",
    display: "Cormorant Garamond + Zhuque Fangsong",
    number: "DM Serif Display",
  },
  "violet-amber": {
    body: "Space Grotesk + ZCOOL QingKe HuangYou",
    display: "Space Grotesk + ZCOOL QingKe HuangYou",
    number: "Space Grotesk",
  },
  "violet-crimson": {
    body: "Cinzel + Ma Shan Zheng",
    display: "Cinzel + Ma Shan Zheng",
    number: "Cinzel",
  },
  "violet-blue": {
    body: "Space Grotesk + ZCOOL QingKe HuangYou",
    display: "Space Grotesk + ZCOOL QingKe HuangYou",
    number: "Space Grotesk",
  },
  "gold-opera": {
    body: "Cormorant Garamond + Zhuque Fangsong",
    display: "Cormorant Garamond + Zhuque Fangsong",
    number: "Cormorant Garamond",
  },
  "scarlet-opera": {
    body: "Libre Caslon Display + Long Cang",
    display: "Libre Caslon Display + Long Cang",
    number: "Libre Caslon Display",
  },
};

export const ALL_FONT_FAMILY_IDS = Object.keys(FONT_FAMILIES) as FontFamilyId[];
