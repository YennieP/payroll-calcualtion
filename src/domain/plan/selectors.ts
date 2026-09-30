import { annualizeMonthly, multiplyByBasisPoints } from "../shared/money";
import type { MoneyCents } from "../shared/money";
import { solveRequiredGross } from "../tax/engine";
import { getTaxRuleSet } from "../tax/rules/us-ca-w2-2026";
import type { AnnualPayEstimate } from "../tax/types";
import type { Category, PlanDocument } from "./types";

export interface CategorySummary {
  categoryId: string;
  goalCount: number;
  pinnedGoalCount: number;
  subtotalCents: MoneyCents;
  pinnedSubtotalCents: MoneyCents;
}

export interface IncomeProjection {
  monthlyGoalTotalCents: MoneyCents;
  monthlyBufferCents: MoneyCents;
  monthlyTargetTakeHomeCents: MoneyCents;
  annualTargetTakeHomeCents: MoneyCents;
  annualPretaxDeductionsCents: MoneyCents;
  annualRequiredGrossCents: MoneyCents;
  monthlyRequiredGrossCents: MoneyCents;
  annualPay: AnnualPayEstimate;
}

function sumGoals(category: Category, pinnedOnly: boolean): MoneyCents {
  return category.goals.reduce(
    (total, goal) => total + (pinnedOnly && !goal.pinned ? 0 : goal.monthlyAmountCents),
    0,
  );
}

export function selectCategorySubtotalCents(plan: PlanDocument, categoryId: string): MoneyCents {
  const category = plan.categories.find((candidate) => candidate.id === categoryId);
  return category ? sumGoals(category, false) : 0;
}

export function selectCategorySummaries(plan: PlanDocument): CategorySummary[] {
  return plan.categories.map((category) => ({
    categoryId: category.id,
    goalCount: category.goals.length,
    pinnedGoalCount: category.goals.filter((goal) => goal.pinned).length,
    subtotalCents: sumGoals(category, false),
    pinnedSubtotalCents: sumGoals(category, true),
  }));
}

export function selectPinnedSubtotalCents(plan: PlanDocument): MoneyCents {
  return plan.categories.reduce((total, category) => total + sumGoals(category, true), 0);
}

export function selectTotalMonthlyGoalCents(plan: PlanDocument): MoneyCents {
  return plan.categories.reduce((total, category) => total + sumGoals(category, false), 0);
}

export function selectMonthlyBufferCents(plan: PlanDocument): MoneyCents {
  return multiplyByBasisPoints(
    selectTotalMonthlyGoalCents(plan),
    plan.taxProfile.bufferBasisPoints,
  );
}

export function selectMonthlyTargetTakeHomeCents(plan: PlanDocument): MoneyCents {
  return selectTotalMonthlyGoalCents(plan) + selectMonthlyBufferCents(plan);
}

export function selectIncomeProjection(plan: PlanDocument): IncomeProjection {
  const monthlyGoalTotalCents = selectTotalMonthlyGoalCents(plan);
  const monthlyBufferCents = selectMonthlyBufferCents(plan);
  const monthlyTargetTakeHomeCents = monthlyGoalTotalCents + monthlyBufferCents;
  const annualTargetTakeHomeCents = annualizeMonthly(monthlyTargetTakeHomeCents);
  const annualPretaxDeductionsCents = annualizeMonthly(plan.taxProfile.monthlyPretaxDeductionCents);
  const annualPay = solveRequiredGross({
    targetTakeHomeCents: annualTargetTakeHomeCents,
    filingStatus: plan.taxProfile.filingStatus,
    pretaxDeductionsCents: annualPretaxDeductionsCents,
    ruleSet: getTaxRuleSet(plan.taxProfile.taxRuleVersion),
  });

  return {
    monthlyGoalTotalCents,
    monthlyBufferCents,
    monthlyTargetTakeHomeCents,
    annualTargetTakeHomeCents,
    annualPretaxDeductionsCents,
    annualRequiredGrossCents: annualPay.grossIncomeCents,
    monthlyRequiredGrossCents: Math.ceil(annualPay.grossIncomeCents / 12),
    annualPay,
  };
}
