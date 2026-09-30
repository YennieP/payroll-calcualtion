import { isNonNegativeSafeInteger, multiplyByBasisPoints } from "../shared/money";
import type { MoneyCents } from "../shared/money";
import { progressiveTax } from "./progressiveTax";
import { US_CA_W2_2026_RULE_SET } from "./rules/us-ca-w2-2026";
import type { AnnualPayEstimate, AnnualPayInput, RequiredGrossInput, TaxBreakdown } from "./types";

const CALIFORNIA_MENTAL_HEALTH_THRESHOLD_CENTS = 100_000_000;
const CALIFORNIA_MENTAL_HEALTH_RATE_BASIS_POINTS = 100;
const INITIAL_SOLVER_CEILING_CENTS = 5_000_000;
export const MAX_SUPPORTED_GROSS_CENTS = 10_000_000_000;

function requireMoneyCents(value: number, field: string): MoneyCents {
  if (!isNonNegativeSafeInteger(value)) {
    throw new TypeError(`${field} must be a non-negative integer number of cents.`);
  }
  return value;
}

export function estimateAnnualPay({
  grossIncomeCents,
  filingStatus = "single",
  pretaxDeductionsCents = 0,
  ruleSet = US_CA_W2_2026_RULE_SET,
}: AnnualPayInput): AnnualPayEstimate {
  const gross = requireMoneyCents(grossIncomeCents, "grossIncomeCents");
  const requestedPretax = requireMoneyCents(pretaxDeductionsCents, "pretaxDeductionsCents");
  const pretax = Math.min(gross, requestedPretax);
  const adjustedIncomeCents = gross - pretax;
  const federalSchedule = ruleSet.federal.schedules[filingStatus];
  const californiaSchedule = ruleSet.california.schedules[filingStatus];

  const federalTaxableIncomeCents = Math.max(
    0,
    adjustedIncomeCents - federalSchedule.standardDeductionCents,
  );
  const californiaTaxableIncomeCents = Math.max(
    0,
    adjustedIncomeCents - californiaSchedule.standardDeductionCents,
  );

  const federalIncomeTaxCents = progressiveTax(federalTaxableIncomeCents, federalSchedule.brackets);
  const californiaBaseIncomeTaxCents = progressiveTax(
    californiaTaxableIncomeCents,
    californiaSchedule.brackets,
  );
  const californiaMentalHealthTaxCents = multiplyByBasisPoints(
    Math.max(0, californiaTaxableIncomeCents - CALIFORNIA_MENTAL_HEALTH_THRESHOLD_CENTS),
    CALIFORNIA_MENTAL_HEALTH_RATE_BASIS_POINTS,
  );

  // Most 401(k) contributions remain subject to FICA and California SDI, so
  // this conservative planner applies payroll taxes to gross W-2 wages.
  const socialSecurityTaxCents = multiplyByBasisPoints(
    Math.min(gross, ruleSet.payroll.socialSecurityWageBaseCents),
    ruleSet.payroll.socialSecurityRateBasisPoints,
  );
  const medicareTaxCents = multiplyByBasisPoints(gross, ruleSet.payroll.medicareRateBasisPoints);
  const additionalMedicareTaxCents = multiplyByBasisPoints(
    Math.max(0, gross - ruleSet.payroll.additionalMedicareThresholdCents[filingStatus]),
    ruleSet.payroll.additionalMedicareRateBasisPoints,
  );
  const californiaSdiTaxCents = multiplyByBasisPoints(
    gross,
    ruleSet.payroll.californiaSdiRateBasisPoints,
  );
  const californiaIncomeTaxCents = californiaBaseIncomeTaxCents + californiaMentalHealthTaxCents;

  const taxes: TaxBreakdown = {
    federalIncomeTaxCents,
    californiaBaseIncomeTaxCents,
    californiaMentalHealthTaxCents,
    californiaIncomeTaxCents,
    socialSecurityTaxCents,
    medicareTaxCents,
    additionalMedicareTaxCents,
    californiaSdiTaxCents,
  };
  const totalTaxCents =
    federalIncomeTaxCents +
    californiaIncomeTaxCents +
    socialSecurityTaxCents +
    medicareTaxCents +
    additionalMedicareTaxCents +
    californiaSdiTaxCents;
  const takeHomeCents = Math.max(0, gross - pretax - totalTaxCents);

  return {
    ruleSetId: ruleSet.id,
    planningYear: ruleSet.planningYear,
    grossIncomeCents: gross,
    pretaxDeductionsCents: pretax,
    adjustedIncomeCents,
    federalTaxableIncomeCents,
    californiaTaxableIncomeCents,
    taxes,
    totalTaxCents,
    takeHomeCents,
    effectiveTaxRate: gross > 0 ? totalTaxCents / gross : 0,
  };
}

export function solveRequiredGross({
  targetTakeHomeCents,
  filingStatus = "single",
  pretaxDeductionsCents = 0,
  ruleSet = US_CA_W2_2026_RULE_SET,
}: RequiredGrossInput): AnnualPayEstimate {
  const target = requireMoneyCents(targetTakeHomeCents, "targetTakeHomeCents");
  const pretax = requireMoneyCents(pretaxDeductionsCents, "pretaxDeductionsCents");

  if (target === 0) {
    return estimateAnnualPay({
      grossIncomeCents: 0,
      filingStatus,
      pretaxDeductionsCents: 0,
      ruleSet,
    });
  }

  let low = 0;
  let high = Math.min(
    MAX_SUPPORTED_GROSS_CENTS,
    Math.max(INITIAL_SOLVER_CEILING_CENTS, target + pretax),
  );

  while (
    estimateAnnualPay({
      grossIncomeCents: high,
      filingStatus,
      pretaxDeductionsCents: pretax,
      ruleSet,
    }).takeHomeCents < target
  ) {
    if (high === MAX_SUPPORTED_GROSS_CENTS) {
      throw new RangeError("Target income is outside the supported range.");
    }
    high = Math.min(MAX_SUPPORTED_GROSS_CENTS, high * 2);
  }

  while (low < high) {
    const midpoint = Math.floor((low + high) / 2);
    const estimate = estimateAnnualPay({
      grossIncomeCents: midpoint,
      filingStatus,
      pretaxDeductionsCents: pretax,
      ruleSet,
    });
    if (estimate.takeHomeCents < target) low = midpoint + 1;
    else high = midpoint;
  }

  return estimateAnnualPay({
    grossIncomeCents: high,
    filingStatus,
    pretaxDeductionsCents: pretax,
    ruleSet,
  });
}
