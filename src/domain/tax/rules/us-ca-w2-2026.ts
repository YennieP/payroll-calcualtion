import { CALIFORNIA_2025_PROXY_RULES } from "./california-2025";
import { FEDERAL_2026_RULES } from "./federal-2026";
import type { PayrollTaxRuleSet, TaxRuleSet } from "../types";

const dollars = (value: number) => value * 100;

export const PAYROLL_2026_RULES = {
  id: "us-payroll-ca-2026-v1",
  jurisdiction: "US-payroll",
  taxYear: 2026,
  planningYear: 2026,
  isPlanningProxy: false,
  sources: [
    {
      authority: "Social Security Administration",
      title: "2026 Social Security changes fact sheet",
      url: "https://www.ssa.gov/cola/factsheets/2026.html",
      taxYear: 2026,
    },
    {
      authority: "California Employment Development Department",
      title: "California payroll tax rates and withholding",
      url: "https://edd.ca.gov/en/Payroll_Taxes/Rates_and_Withholding",
      taxYear: 2026,
    },
  ],
  socialSecurityRateBasisPoints: 620,
  socialSecurityWageBaseCents: dollars(184_500),
  medicareRateBasisPoints: 145,
  additionalMedicareRateBasisPoints: 90,
  additionalMedicareThresholdCents: {
    single: dollars(200_000),
    married: dollars(250_000),
    head: dollars(200_000),
  },
  californiaSdiRateBasisPoints: 130,
} as const satisfies PayrollTaxRuleSet;

export const US_CA_W2_2026_RULE_SET = {
  id: "us-ca-w2-2026-v1",
  planningYear: 2026,
  description:
    "California W-2 planning estimate using 2026 federal/payroll rules and the official 2025 California resident schedule as a planning proxy.",
  federal: FEDERAL_2026_RULES,
  california: CALIFORNIA_2025_PROXY_RULES,
  payroll: PAYROLL_2026_RULES,
} as const satisfies TaxRuleSet;

export const DEFAULT_TAX_RULE_SET_ID = US_CA_W2_2026_RULE_SET.id;

const TAX_RULE_SETS: Readonly<Record<string, TaxRuleSet>> = {
  [US_CA_W2_2026_RULE_SET.id]: US_CA_W2_2026_RULE_SET,
};

export function getTaxRuleSet(ruleSetId: string): TaxRuleSet {
  const ruleSet = TAX_RULE_SETS[ruleSetId];
  if (!ruleSet) {
    throw new Error(`Unsupported tax rule set: ${ruleSetId}`);
  }
  return ruleSet;
}
