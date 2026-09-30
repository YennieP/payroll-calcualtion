const FEDERAL_2026 = {
  single: {
    standardDeduction: 16100,
    brackets: [
      [12400, 0.1],
      [50400, 0.12],
      [105700, 0.22],
      [201775, 0.24],
      [256225, 0.32],
      [640600, 0.35],
      [Infinity, 0.37],
    ],
  },
  married: {
    standardDeduction: 32200,
    brackets: [
      [24800, 0.1],
      [100800, 0.12],
      [211400, 0.22],
      [403550, 0.24],
      [512450, 0.32],
      [768700, 0.35],
      [Infinity, 0.37],
    ],
  },
  head: {
    standardDeduction: 24150,
    brackets: [
      [17700, 0.1],
      [67450, 0.12],
      [105700, 0.22],
      [201750, 0.24],
      [256200, 0.32],
      [640600, 0.35],
      [Infinity, 0.37],
    ],
  },
};

// California's final 2026 resident rate schedule is not yet published.
// The latest official 2025 schedule is used as a planning proxy.
const CALIFORNIA_2025 = {
  single: {
    standardDeduction: 5706,
    brackets: [
      [11079, 0.01],
      [26264, 0.02],
      [41452, 0.04],
      [57542, 0.06],
      [72724, 0.08],
      [371479, 0.093],
      [445771, 0.103],
      [742953, 0.113],
      [Infinity, 0.123],
    ],
  },
  married: {
    standardDeduction: 11412,
    brackets: [
      [22158, 0.01],
      [52528, 0.02],
      [82904, 0.04],
      [115084, 0.06],
      [145448, 0.08],
      [742958, 0.093],
      [891542, 0.103],
      [1485906, 0.113],
      [Infinity, 0.123],
    ],
  },
  head: {
    standardDeduction: 11412,
    brackets: [
      [22173, 0.01],
      [52530, 0.02],
      [67716, 0.04],
      [83805, 0.06],
      [98990, 0.08],
      [505208, 0.093],
      [606251, 0.103],
      [1010417, 0.113],
      [Infinity, 0.123],
    ],
  },
};

export const TAX_ASSUMPTIONS = Object.freeze({
  socialSecurityRate: 0.062,
  socialSecurityWageBase: 184500,
  medicareRate: 0.0145,
  additionalMedicareRate: 0.009,
  caSdiRate: 0.013,
});

export function progressiveTax(taxableIncome, brackets) {
  const income = Math.max(0, Number(taxableIncome) || 0);
  let tax = 0;
  let previousLimit = 0;

  for (const [limit, rate] of brackets) {
    if (income <= previousLimit) break;
    const amountInBracket = Math.min(income, limit) - previousLimit;
    tax += amountInBracket * rate;
    previousLimit = limit;
  }

  return tax;
}

export function estimateAnnualPay({
  grossIncome,
  filingStatus = "single",
  pretaxDeductions = 0,
}) {
  const gross = Math.max(0, Number(grossIncome) || 0);
  const pretax = Math.min(gross, Math.max(0, Number(pretaxDeductions) || 0));
  const federalProfile = FEDERAL_2026[filingStatus] ?? FEDERAL_2026.single;
  const stateProfile = CALIFORNIA_2025[filingStatus] ?? CALIFORNIA_2025.single;
  const adjustedIncome = Math.max(0, gross - pretax);

  const federalTaxableIncome = Math.max(
    0,
    adjustedIncome - federalProfile.standardDeduction,
  );
  const californiaTaxableIncome = Math.max(
    0,
    adjustedIncome - stateProfile.standardDeduction,
  );

  const federalIncomeTax = progressiveTax(
    federalTaxableIncome,
    federalProfile.brackets,
  );
  const californiaBaseTax = progressiveTax(
    californiaTaxableIncome,
    stateProfile.brackets,
  );
  const californiaMentalHealthTax = Math.max(
    0,
    californiaTaxableIncome - 1000000,
  ) * 0.01;

  // Most 401(k) contributions remain subject to FICA and CA SDI. This
  // conservative planner therefore applies payroll taxes to gross wages.
  const socialSecurity =
    Math.min(gross, TAX_ASSUMPTIONS.socialSecurityWageBase) *
    TAX_ASSUMPTIONS.socialSecurityRate;
  const medicare = gross * TAX_ASSUMPTIONS.medicareRate;
  const additionalMedicareThreshold = filingStatus === "married" ? 250000 : 200000;
  const additionalMedicare =
    Math.max(0, gross - additionalMedicareThreshold) *
    TAX_ASSUMPTIONS.additionalMedicareRate;
  const californiaSdi = gross * TAX_ASSUMPTIONS.caSdiRate;

  const taxes = {
    federalIncomeTax,
    californiaIncomeTax: californiaBaseTax + californiaMentalHealthTax,
    socialSecurity,
    medicare: medicare + additionalMedicare,
    californiaSdi,
  };
  const totalTax = Object.values(taxes).reduce((total, value) => total + value, 0);
  const takeHome = Math.max(0, gross - pretax - totalTax);

  return {
    grossIncome: gross,
    pretaxDeductions: pretax,
    adjustedIncome,
    federalTaxableIncome,
    californiaTaxableIncome,
    taxes,
    totalTax,
    takeHome,
    effectiveTaxRate: gross > 0 ? totalTax / gross : 0,
  };
}

export function solveRequiredGross({
  targetTakeHome,
  filingStatus = "single",
  pretaxDeductions = 0,
}) {
  const target = Math.max(0, Number(targetTakeHome) || 0);
  const pretax = Math.max(0, Number(pretaxDeductions) || 0);

  if (target === 0 && pretax === 0) {
    return estimateAnnualPay({ grossIncome: 0, filingStatus, pretaxDeductions: 0 });
  }

  let low = 0;
  let high = Math.max(50000, target + pretax);
  while (
    estimateAnnualPay({
      grossIncome: high,
      filingStatus,
      pretaxDeductions: pretax,
    }).takeHome < target
  ) {
    high *= 2;
    if (high > 100000000) throw new Error("Target income is outside the supported range.");
  }

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const midpoint = (low + high) / 2;
    const result = estimateAnnualPay({
      grossIncome: midpoint,
      filingStatus,
      pretaxDeductions: pretax,
    });
    if (result.takeHome < target) low = midpoint;
    else high = midpoint;
  }

  return estimateAnnualPay({
    grossIncome: high,
    filingStatus,
    pretaxDeductions: pretax,
  });
}

export const TAX_DATA = Object.freeze({
  federal: FEDERAL_2026,
  california: CALIFORNIA_2025,
});
