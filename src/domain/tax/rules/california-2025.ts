import type { IncomeTaxRuleSet } from "../types";

const dollars = (value: number) => value * 100;

export const CALIFORNIA_2025_PROXY_RULES = {
  id: "us-ca-2025-proxy-for-2026-v1",
  jurisdiction: "US-CA",
  taxYear: 2025,
  planningYear: 2026,
  isPlanningProxy: true,
  proxyReason:
    "California's final 2026 resident schedule was not published when this planning rule set was created.",
  source: {
    authority: "California Franchise Tax Board",
    title: "2025 California tax rate schedules",
    url: "https://www.ftb.ca.gov/about-ftb/newsroom/tax-news/2025/10.html",
    taxYear: 2025,
  },
  schedules: {
    single: {
      standardDeductionCents: dollars(5_706),
      brackets: [
        { upperLimitCents: dollars(11_079), rateBasisPoints: 100 },
        { upperLimitCents: dollars(26_264), rateBasisPoints: 200 },
        { upperLimitCents: dollars(41_452), rateBasisPoints: 400 },
        { upperLimitCents: dollars(57_542), rateBasisPoints: 600 },
        { upperLimitCents: dollars(72_724), rateBasisPoints: 800 },
        { upperLimitCents: dollars(371_479), rateBasisPoints: 930 },
        { upperLimitCents: dollars(445_771), rateBasisPoints: 1_030 },
        { upperLimitCents: dollars(742_953), rateBasisPoints: 1_130 },
        { upperLimitCents: null, rateBasisPoints: 1_230 },
      ],
    },
    married: {
      standardDeductionCents: dollars(11_412),
      brackets: [
        { upperLimitCents: dollars(22_158), rateBasisPoints: 100 },
        { upperLimitCents: dollars(52_528), rateBasisPoints: 200 },
        { upperLimitCents: dollars(82_904), rateBasisPoints: 400 },
        { upperLimitCents: dollars(115_084), rateBasisPoints: 600 },
        { upperLimitCents: dollars(145_448), rateBasisPoints: 800 },
        { upperLimitCents: dollars(742_958), rateBasisPoints: 930 },
        { upperLimitCents: dollars(891_542), rateBasisPoints: 1_030 },
        { upperLimitCents: dollars(1_485_906), rateBasisPoints: 1_130 },
        { upperLimitCents: null, rateBasisPoints: 1_230 },
      ],
    },
    head: {
      standardDeductionCents: dollars(11_412),
      brackets: [
        { upperLimitCents: dollars(22_173), rateBasisPoints: 100 },
        { upperLimitCents: dollars(52_530), rateBasisPoints: 200 },
        { upperLimitCents: dollars(67_716), rateBasisPoints: 400 },
        { upperLimitCents: dollars(83_805), rateBasisPoints: 600 },
        { upperLimitCents: dollars(98_990), rateBasisPoints: 800 },
        { upperLimitCents: dollars(505_208), rateBasisPoints: 930 },
        { upperLimitCents: dollars(606_251), rateBasisPoints: 1_030 },
        { upperLimitCents: dollars(1_010_417), rateBasisPoints: 1_130 },
        { upperLimitCents: null, rateBasisPoints: 1_230 },
      ],
    },
  },
} as const satisfies IncomeTaxRuleSet;
