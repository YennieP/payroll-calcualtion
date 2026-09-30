import { isNonNegativeSafeInteger, multiplyByBasisPoints } from "../shared/money";
import type { MoneyCents } from "../shared/money";
import type { TaxBracket } from "./types";

export function progressiveTax(
  taxableIncomeCents: MoneyCents,
  brackets: readonly TaxBracket[],
): MoneyCents {
  if (!isNonNegativeSafeInteger(taxableIncomeCents)) {
    throw new TypeError("Taxable income must be a non-negative integer number of cents.");
  }

  let taxCents = 0;
  let previousLimitCents = 0;

  for (const bracket of brackets) {
    if (bracket.upperLimitCents !== null && bracket.upperLimitCents < previousLimitCents) {
      throw new TypeError("Tax bracket upper limits must be in ascending order.");
    }
    if (taxableIncomeCents <= previousLimitCents) break;

    const upperLimitCents = bracket.upperLimitCents ?? taxableIncomeCents;
    const amountInBracketCents = Math.min(taxableIncomeCents, upperLimitCents) - previousLimitCents;
    taxCents += multiplyByBasisPoints(amountInBracketCents, bracket.rateBasisPoints);
    previousLimitCents = upperLimitCents;
    if (bracket.upperLimitCents === null) break;
  }

  return taxCents;
}
