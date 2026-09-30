import { describe, expect, it } from "vitest";

import { estimateAnnualPay, solveRequiredGross } from "./engine";
import { CALIFORNIA_2025_PROXY_RULES } from "./rules/california-2025";
import { FEDERAL_2026_RULES } from "./rules/federal-2026";
import { US_CA_W2_2026_RULE_SET } from "./rules/us-ca-w2-2026";

const dollars = (value: number) => value * 100;

describe("estimateAnnualPay", () => {
  it("applies the 2026 federal standard deduction", () => {
    const result = estimateAnnualPay({
      grossIncomeCents: FEDERAL_2026_RULES.schedules.single.standardDeductionCents,
    });

    expect(result.taxes.federalIncomeTaxCents).toBe(0);
  });

  it("caps Social Security at the 2026 wage base", () => {
    const atCap = estimateAnnualPay({ grossIncomeCents: dollars(184_500) });
    const aboveCap = estimateAnnualPay({ grossIncomeCents: dollars(300_000) });

    expect(aboveCap.taxes.socialSecurityTaxCents).toBe(atCap.taxes.socialSecurityTaxCents);
  });

  it("applies Additional Medicare above the filing-status threshold", () => {
    const atThreshold = estimateAnnualPay({ grossIncomeCents: dollars(200_000) });
    const aboveThreshold = estimateAnnualPay({ grossIncomeCents: dollars(210_000) });

    expect(aboveThreshold.taxes.additionalMedicareTaxCents).toBe(dollars(90));
    expect(aboveThreshold.taxes.medicareTaxCents - atThreshold.taxes.medicareTaxCents).toBe(
      dollars(145),
    );
  });

  it("applies California mental-health tax above $1m of state taxable income", () => {
    const thresholdGrossCents =
      dollars(1_000_000) + CALIFORNIA_2025_PROXY_RULES.schedules.single.standardDeductionCents;
    const atThreshold = estimateAnnualPay({ grossIncomeCents: thresholdGrossCents });
    const aboveThreshold = estimateAnnualPay({
      grossIncomeCents: thresholdGrossCents + dollars(10_000),
    });

    expect(atThreshold.taxes.californiaMentalHealthTaxCents).toBe(0);
    expect(aboveThreshold.taxes.californiaMentalHealthTaxCents).toBe(dollars(100));
  });

  it("keeps every money result in integer cents", () => {
    const result = estimateAnnualPay({ grossIncomeCents: 12_345_678 });
    const moneyValues = [
      result.grossIncomeCents,
      result.pretaxDeductionsCents,
      result.adjustedIncomeCents,
      result.federalTaxableIncomeCents,
      result.californiaTaxableIncomeCents,
      result.totalTaxCents,
      result.takeHomeCents,
      ...Object.values(result.taxes),
    ];

    expect(moneyValues.every(Number.isInteger)).toBe(true);
  });
});

describe("solveRequiredGross", () => {
  it("returns zero for a zero take-home target", () => {
    const result = solveRequiredGross({
      targetTakeHomeCents: 0,
      pretaxDeductionsCents: dollars(6_000),
    });

    expect(result.grossIncomeCents).toBe(0);
    expect(result.takeHomeCents).toBe(0);
  });

  it("finds the minimum cent of gross income that covers the target", () => {
    const targetTakeHomeCents = dollars(96_000);
    const pretaxDeductionsCents = dollars(6_000);
    const result = solveRequiredGross({ targetTakeHomeCents, pretaxDeductionsCents });
    const oneCentLess = estimateAnnualPay({
      grossIncomeCents: result.grossIncomeCents - 1,
      pretaxDeductionsCents,
    });

    expect(result.takeHomeCents).toBeGreaterThanOrEqual(targetTakeHomeCents);
    expect(oneCentLess.takeHomeCents).toBeLessThan(targetTakeHomeCents);
  });

  it("requires less gross for married filing jointly than single at the same target", () => {
    const targetTakeHomeCents = dollars(150_000);
    const single = solveRequiredGross({ targetTakeHomeCents, filingStatus: "single" });
    const married = solveRequiredGross({ targetTakeHomeCents, filingStatus: "married" });

    expect(married.grossIncomeCents).toBeLessThan(single.grossIncomeCents);
  });
});

describe("tax rule metadata", () => {
  it("identifies the California 2025 schedule as a 2026 planning proxy", () => {
    expect(US_CA_W2_2026_RULE_SET.planningYear).toBe(2026);
    expect(US_CA_W2_2026_RULE_SET.california.taxYear).toBe(2025);
    expect(US_CA_W2_2026_RULE_SET.california.isPlanningProxy).toBe(true);
    expect(US_CA_W2_2026_RULE_SET.california.source.url).toMatch(/^https:\/\//);
  });
});
