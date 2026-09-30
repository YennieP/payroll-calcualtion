import type { BasisPoints, MoneyCents } from "../shared/money";

export type FilingStatus = "single" | "married" | "head";
export type TaxJurisdiction = "US-federal" | "US-CA" | "US-payroll";

export interface TaxBracket {
  /** Null means the bracket has no upper limit. */
  upperLimitCents: MoneyCents | null;
  rateBasisPoints: BasisPoints;
}

export interface FilingStatusTaxSchedule {
  standardDeductionCents: MoneyCents;
  brackets: readonly TaxBracket[];
}

export interface TaxSource {
  authority: string;
  title: string;
  url: string;
  taxYear: number;
}

export interface IncomeTaxRuleSet {
  id: string;
  jurisdiction: Exclude<TaxJurisdiction, "US-payroll">;
  taxYear: number;
  planningYear: number;
  isPlanningProxy: boolean;
  proxyReason?: string;
  source: TaxSource;
  schedules: Readonly<Record<FilingStatus, FilingStatusTaxSchedule>>;
}

export interface PayrollTaxRuleSet {
  id: string;
  jurisdiction: "US-payroll";
  taxYear: number;
  planningYear: number;
  isPlanningProxy: false;
  sources: readonly TaxSource[];
  socialSecurityRateBasisPoints: BasisPoints;
  socialSecurityWageBaseCents: MoneyCents;
  medicareRateBasisPoints: BasisPoints;
  additionalMedicareRateBasisPoints: BasisPoints;
  additionalMedicareThresholdCents: Readonly<Record<FilingStatus, MoneyCents>>;
  californiaSdiRateBasisPoints: BasisPoints;
}

export interface TaxRuleSet {
  id: string;
  planningYear: number;
  description: string;
  federal: IncomeTaxRuleSet;
  california: IncomeTaxRuleSet;
  payroll: PayrollTaxRuleSet;
}

export interface AnnualPayInput {
  grossIncomeCents: MoneyCents;
  filingStatus?: FilingStatus;
  pretaxDeductionsCents?: MoneyCents;
  ruleSet?: TaxRuleSet;
}

export interface TaxBreakdown {
  federalIncomeTaxCents: MoneyCents;
  californiaBaseIncomeTaxCents: MoneyCents;
  californiaMentalHealthTaxCents: MoneyCents;
  californiaIncomeTaxCents: MoneyCents;
  socialSecurityTaxCents: MoneyCents;
  medicareTaxCents: MoneyCents;
  additionalMedicareTaxCents: MoneyCents;
  californiaSdiTaxCents: MoneyCents;
}

export interface AnnualPayEstimate {
  ruleSetId: string;
  planningYear: number;
  grossIncomeCents: MoneyCents;
  pretaxDeductionsCents: MoneyCents;
  adjustedIncomeCents: MoneyCents;
  federalTaxableIncomeCents: MoneyCents;
  californiaTaxableIncomeCents: MoneyCents;
  taxes: TaxBreakdown;
  totalTaxCents: MoneyCents;
  takeHomeCents: MoneyCents;
  effectiveTaxRate: number;
}

export interface RequiredGrossInput {
  targetTakeHomeCents: MoneyCents;
  filingStatus?: FilingStatus;
  pretaxDeductionsCents?: MoneyCents;
  ruleSet?: TaxRuleSet;
}
