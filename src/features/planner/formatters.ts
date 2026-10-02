import type { BudgetMode, FilingStatus } from "../../domain/plan";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const BUDGET_MODE_LABELS: Record<BudgetMode, string> = {
  "monthly-fixed": "每月固定",
  "monthly-variable": "每月浮动",
  "monthly-average": "月均预算",
};

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: "Single",
  married: "Married filing jointly",
  head: "Head of household",
};

export function formatMoney(cents: number): string {
  return money.format(cents / 100);
}

export function formatPercent(ratio: number, fractionDigits = 1): string {
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}

export function dollarsToCents(value: string): number {
  const dollars = Number(value);
  if (!Number.isFinite(dollars)) return 0;
  const cents = Math.round(dollars * 100);
  return Number.isSafeInteger(cents) ? Math.max(0, cents) : Number.MAX_SAFE_INTEGER;
}
