export { estimateAnnualPay, MAX_SUPPORTED_GROSS_CENTS, solveRequiredGross } from "./engine";
export { progressiveTax } from "./progressiveTax";
export { CALIFORNIA_2025_PROXY_RULES } from "./rules/california-2025";
export { FEDERAL_2026_RULES } from "./rules/federal-2026";
export {
  DEFAULT_TAX_RULE_SET_ID,
  getTaxRuleSet,
  PAYROLL_2026_RULES,
  US_CA_W2_2026_RULE_SET,
} from "./rules/us-ca-w2-2026";
export type {
  AnnualPayEstimate,
  AnnualPayInput,
  FilingStatus,
  IncomeTaxRuleSet,
  RequiredGrossInput,
  TaxBracket,
  TaxBreakdown,
  TaxRuleSet,
  TaxSource,
} from "./types";
