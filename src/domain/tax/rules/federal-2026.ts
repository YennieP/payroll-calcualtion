import type { IncomeTaxRuleSet } from "../types";

const dollars = (value: number) => value * 100;

export const FEDERAL_2026_RULES = {
  id: "us-federal-2026-v1",
  jurisdiction: "US-federal",
  taxYear: 2026,
  planningYear: 2026,
  isPlanningProxy: false,
  source: {
    authority: "Internal Revenue Service",
    title: "Tax year 2026 inflation adjustments and Revenue Procedure 2025-32",
    url: "https://www.irs.gov/irb/2025-45_IRB",
    taxYear: 2026,
  },
  schedules: {
    single: {
      standardDeductionCents: dollars(16_100),
      brackets: [
        { upperLimitCents: dollars(12_400), rateBasisPoints: 1_000 },
        { upperLimitCents: dollars(50_400), rateBasisPoints: 1_200 },
        { upperLimitCents: dollars(105_700), rateBasisPoints: 2_200 },
        { upperLimitCents: dollars(201_775), rateBasisPoints: 2_400 },
        { upperLimitCents: dollars(256_225), rateBasisPoints: 3_200 },
        { upperLimitCents: dollars(640_600), rateBasisPoints: 3_500 },
        { upperLimitCents: null, rateBasisPoints: 3_700 },
      ],
    },
    married: {
      standardDeductionCents: dollars(32_200),
      brackets: [
        { upperLimitCents: dollars(24_800), rateBasisPoints: 1_000 },
        { upperLimitCents: dollars(100_800), rateBasisPoints: 1_200 },
        { upperLimitCents: dollars(211_400), rateBasisPoints: 2_200 },
        { upperLimitCents: dollars(403_550), rateBasisPoints: 2_400 },
        { upperLimitCents: dollars(512_450), rateBasisPoints: 3_200 },
        { upperLimitCents: dollars(768_700), rateBasisPoints: 3_500 },
        { upperLimitCents: null, rateBasisPoints: 3_700 },
      ],
    },
    head: {
      standardDeductionCents: dollars(24_150),
      brackets: [
        { upperLimitCents: dollars(17_700), rateBasisPoints: 1_000 },
        { upperLimitCents: dollars(67_450), rateBasisPoints: 1_200 },
        { upperLimitCents: dollars(105_700), rateBasisPoints: 2_200 },
        { upperLimitCents: dollars(201_750), rateBasisPoints: 2_400 },
        { upperLimitCents: dollars(256_200), rateBasisPoints: 3_200 },
        { upperLimitCents: dollars(640_600), rateBasisPoints: 3_500 },
        { upperLimitCents: null, rateBasisPoints: 3_700 },
      ],
    },
  },
} as const satisfies IncomeTaxRuleSet;
