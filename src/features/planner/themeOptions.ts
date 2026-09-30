import type { ThemeId } from "../../domain/plan";

export interface ThemeOption {
  id: ThemeId;
  name: string;
  description: string;
  kicker: string;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    id: "rouge",
    name: "绯红绒",
    description: "奶油 · 酒红 · 香槟金",
    kicker: "VELVET COLLECTION",
  },
  {
    id: "midnight",
    name: "蓝午夜",
    description: "墨蓝 · 电光蓝 · 月光金",
    kicker: "AFTER DARK · BLUE MIDNIGHT",
  },
  {
    id: "violet-amber",
    name: "紫午夜 · 琥珀",
    description: "黑紫 · 荧光紫 · 琥珀金",
    kicker: "AMBER OVERTURE · 01:13",
  },
  {
    id: "violet-crimson",
    name: "紫午夜 · 绯红",
    description: "黑紫 · 荧光紫 · 绯红",
    kicker: "CRIMSON AFTER DARK · 01:13",
  },
  {
    id: "violet-blue",
    name: "紫午夜 · 电光蓝",
    description: "黑紫 · 荧光紫 · 电光蓝",
    kicker: "ELECTRIC VIOLET · 01:13",
  },
  {
    id: "gold-opera",
    name: "金歌剧",
    description: "黑梅 · 宝石红 · 古典金",
    kicker: "ACT V · GRAND FINALE",
  },
  {
    id: "scarlet-opera",
    name: "绯歌剧",
    description: "剧院黑 · 鲜红 · 香槟金",
    kicker: "ACT VI · ROSSO FINALE",
  },
] as const;

export function getThemeOption(themeId: ThemeId): ThemeOption {
  return THEME_OPTIONS.find((theme) => theme.id === themeId) ?? THEME_OPTIONS[0];
}
