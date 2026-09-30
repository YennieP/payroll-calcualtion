export type MoneyCents = number;
export type BasisPoints = number;

const BASIS_POINTS_PER_UNIT = 10_000;

export function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function multiplyByBasisPoints(
  amountCents: MoneyCents,
  rateBasisPoints: BasisPoints,
): MoneyCents {
  return Math.round((amountCents * rateBasisPoints) / BASIS_POINTS_PER_UNIT);
}

export function annualizeMonthly(monthlyAmountCents: MoneyCents): MoneyCents {
  return monthlyAmountCents * 12;
}
