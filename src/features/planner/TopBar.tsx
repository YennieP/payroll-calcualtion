import type { Dispatch, ReactNode } from "react";

import type { AppAction, AppState } from "../../app/appReducer";
import type { FilingStatus } from "../../domain/plan";
import { dollarsToCents, FILING_STATUS_LABELS } from "./formatters";
import { getThemeOption, THEME_OPTIONS } from "./themeOptions";

interface TopBarProps {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  createMetadata: () => { updatedAt: string; updatedByDevice: string };
  isOnline: boolean;
  accountControl?: ReactNode;
}

const SAVE_LABELS: Record<AppState["saveStatus"], string> = {
  loading: "正在读取本机数据",
  "local-change": "本机有待保存修改",
  saving: "正在保存",
  saved: "已保存到本机",
  error: "本机保存失败",
  conflict: "检测到版本冲突",
};

export function TopBar({ state, dispatch, createMetadata, isOnline, accountControl }: TopBarProps) {
  const theme = getThemeOption(state.plan.preferences.themeId);
  const profile = state.plan.taxProfile;

  return (
    <header className="topbar">
      <button
        className="logo"
        type="button"
        aria-label="返回置顶主页"
        onClick={() => dispatch({ type: "navigate-pinned" })}
      >
        <i aria-hidden="true">W</i>
        <span>WORTHWHILE</span>
      </button>

      <label className="search-control">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={state.searchQuery}
          placeholder="搜索你的 50 个目标"
          aria-label="搜索目标"
          onChange={(event) => dispatch({ type: "search-changed", query: event.target.value })}
        />
      </label>

      <div className="topbar-control theme-control">
        <button
          className="compact-control"
          type="button"
          aria-label={`主题${theme.name}`}
          aria-haspopup="dialog"
          aria-expanded={state.themePanelOpen}
          onClick={() => dispatch({ type: "panel-toggled", panel: "theme" })}
        >
          <span className="current-swatches" aria-hidden="true">
            <i />
            <i />
          </span>
          <span className="control-prefix">主题</span>
          <b>{theme.name}</b>
          <span aria-hidden="true">⌄</span>
        </button>
        {state.themePanelOpen ? (
          <section className="theme-panel" role="dialog" aria-label="选择主题">
            <header>
              <div>
                <strong>选择主题</strong>
                <small>页面内容与计算不会改变</small>
              </div>
              <button
                type="button"
                aria-label="关闭主题选择"
                onClick={() => dispatch({ type: "panel-toggled", panel: "theme" })}
              >
                ×
              </button>
            </header>
            <div className="theme-grid">
              {THEME_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  data-theme-value={option.id}
                  aria-pressed={option.id === theme.id}
                  onClick={() =>
                    dispatch({
                      type: "theme-selected",
                      themeId: option.id,
                      metadata: createMetadata(),
                    })
                  }
                >
                  <span className="option-swatches" aria-hidden="true">
                    <i />
                    <i />
                  </span>
                  <b>{option.name}</b>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="topbar-control profile-control">
        <button
          className="compact-control"
          type="button"
          aria-haspopup="dialog"
          aria-expanded={state.taxProfileOpen}
          onClick={() => dispatch({ type: "panel-toggled", panel: "tax-profile" })}
        >
          CA · {FILING_STATUS_LABELS[profile.filingStatus]} <span aria-hidden="true">⌄</span>
        </button>
        {state.taxProfileOpen ? (
          <section className="tax-profile-panel" role="dialog" aria-label="税务资料">
            <header>
              <div>
                <strong>税务资料</strong>
                <small>2026 California W-2 planning estimate</small>
              </div>
              <button
                type="button"
                aria-label="关闭税务资料"
                onClick={() => dispatch({ type: "panel-toggled", panel: "tax-profile" })}
              >
                ×
              </button>
            </header>
            <label>
              <span>报税身份</span>
              <select
                value={profile.filingStatus}
                onChange={(event) =>
                  dispatch({
                    type: "tax-profile-updated",
                    changes: { filingStatus: event.target.value as FilingStatus },
                    metadata: createMetadata(),
                  })
                }
              >
                {Object.entries(FILING_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>每月税前扣除</span>
              <div className="money-field">
                <span>$</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={profile.monthlyPretaxDeductionCents / 100}
                  onChange={(event) =>
                    dispatch({
                      type: "tax-profile-updated",
                      changes: { monthlyPretaxDeductionCents: dollarsToCents(event.target.value) },
                      metadata: createMetadata(),
                    })
                  }
                />
              </div>
            </label>
            <label>
              <span>
                安全余量 <b>{(profile.bufferBasisPoints / 100).toFixed(0)}%</b>
              </span>
              <input
                type="range"
                min="0"
                max="2500"
                step="100"
                value={profile.bufferBasisPoints}
                onChange={(event) =>
                  dispatch({
                    type: "tax-profile-updated",
                    changes: { bufferBasisPoints: Number(event.target.value) },
                    metadata: createMetadata(),
                  })
                }
              />
            </label>
            <p>税前扣除会增加所需工资，但通常减少所得税。结果仅用于规划。</p>
          </section>
        ) : null}
      </div>

      {accountControl}

      <span
        className={`save-indicator is-${state.saveStatus}`}
        title={state.saveError ?? SAVE_LABELS[state.saveStatus]}
      >
        <i aria-hidden="true" />
        {isOnline ? SAVE_LABELS[state.saveStatus] : "离线 · 本机可用"}
      </span>
    </header>
  );
}
