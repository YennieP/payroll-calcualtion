import type { Dispatch } from "react";

import type { AppAction, AppState } from "../../app/appReducer";
import { selectIncomeProjection } from "../../domain/plan";
import { getTaxRuleSet } from "../../domain/tax";
import { formatMoney, formatPercent } from "./formatters";

interface IncomePanelProps {
  state: AppState;
  dispatch: Dispatch<AppAction>;
}

export function IncomePanel({ state, dispatch }: IncomePanelProps) {
  const projection = selectIncomeProjection(state.plan);
  const estimate = projection.annualPay;
  const ruleSet = getTaxRuleSet(state.plan.taxProfile.taxRuleVersion);
  const usableRatio =
    estimate.grossIncomeCents > 0 ? estimate.takeHomeCents / estimate.grossIncomeCents : 0;
  const taxRatio =
    estimate.grossIncomeCents > 0 ? estimate.totalTaxCents / estimate.grossIncomeCents : 0;

  return (
    <aside className="income-panel">
      <span>INCOME TARGET</span>
      <p>建议税前年薪</p>
      <strong>{formatMoney(projection.annualRequiredGrossCents)}</strong>
      <small>{formatMoney(projection.monthlyRequiredGrossCents)} / 月税前</small>
      <div className="income-meter" aria-label="收入中税后可用和预计税费的比例">
        <i style={{ width: `${usableRatio * 100}%` }} />
        <i style={{ width: `${taxRatio * 100}%` }} />
      </div>
      <div className="income-legend">
        <span>
          <i />
          税后可用 {formatPercent(usableRatio, 0)}
        </span>
        <span>
          <i />
          预计税费 {formatPercent(taxRatio, 0)}
        </span>
      </div>
      <dl>
        <div>
          <dt>生活目标</dt>
          <dd>{formatMoney(projection.monthlyGoalTotalCents)}</dd>
        </div>
        <div>
          <dt>安全余量</dt>
          <dd>{formatMoney(projection.monthlyBufferCents)}</dd>
        </div>
        <div>
          <dt>税前扣除</dt>
          <dd>{formatMoney(state.plan.taxProfile.monthlyPretaxDeductionCents)}</dd>
        </div>
        <div>
          <dt>预计税费</dt>
          <dd>{formatMoney(Math.round(estimate.totalTaxCents / 12))}</dd>
        </div>
      </dl>
      <button
        type="button"
        aria-expanded={state.taxDetailsOpen}
        onClick={() => dispatch({ type: "panel-toggled", panel: "tax-details" })}
      >
        查看完整税费 →
      </button>
      <em>所有结果均由当前本机计划即时计算</em>

      {state.taxDetailsOpen ? (
        <section className="tax-details-panel" role="dialog" aria-label="完整税费明细">
          <header>
            <div>
              <strong>完整税费明细</strong>
              <small>{ruleSet.description}</small>
            </div>
            <button
              type="button"
              aria-label="关闭税费明细"
              onClick={() => dispatch({ type: "panel-toggled", panel: "tax-details" })}
            >
              ×
            </button>
          </header>
          <dl>
            <div>
              <dt>Federal income tax</dt>
              <dd>{formatMoney(estimate.taxes.federalIncomeTaxCents)}</dd>
            </div>
            <div>
              <dt>California base income tax</dt>
              <dd>{formatMoney(estimate.taxes.californiaBaseIncomeTaxCents)}</dd>
            </div>
            <div>
              <dt>CA mental-health tax</dt>
              <dd>{formatMoney(estimate.taxes.californiaMentalHealthTaxCents)}</dd>
            </div>
            <div>
              <dt>Social Security</dt>
              <dd>{formatMoney(estimate.taxes.socialSecurityTaxCents)}</dd>
            </div>
            <div>
              <dt>Medicare</dt>
              <dd>{formatMoney(estimate.taxes.medicareTaxCents)}</dd>
            </div>
            <div>
              <dt>Additional Medicare</dt>
              <dd>{formatMoney(estimate.taxes.additionalMedicareTaxCents)}</dd>
            </div>
            <div>
              <dt>California SDI</dt>
              <dd>{formatMoney(estimate.taxes.californiaSdiTaxCents)}</dd>
            </div>
            <div className="tax-total">
              <dt>预计税费合计</dt>
              <dd>{formatMoney(estimate.totalTaxCents)}</dd>
            </div>
          </dl>
          <p>
            Federal {ruleSet.federal.taxYear} · California {ruleSet.california.taxYear}
            {ruleSet.california.isPlanningProxy ? " planning proxy" : ""}.
            结果采用标准扣除，仅供生活规划，不能替代专业税务建议。
          </p>
        </section>
      ) : null}
    </aside>
  );
}
