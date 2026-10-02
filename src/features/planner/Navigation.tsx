import type { Dispatch } from "react";

import type { AppAction, AppState } from "../../app/appReducer";
import {
  MAX_PLAN_CATEGORIES,
  selectCategorySummaries,
  selectPinnedSubtotalCents,
} from "../../domain/plan";
import { formatMoney } from "./formatters";

interface NavigationProps {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  createId: () => string;
  createMetadata: () => { updatedAt: string; updatedByDevice: string };
}

export function Navigation({ state, dispatch, createId, createMetadata }: NavigationProps) {
  const summaries = selectCategorySummaries(state.plan);
  const pinnedCount = summaries.reduce((total, summary) => total + summary.pinnedGoalCount, 0);
  const totalGoals = summaries.reduce((total, summary) => total + summary.goalCount, 0);
  const totalCents = summaries.reduce((total, summary) => total + summary.subtotalCents, 0);

  return (
    <nav className="planner-nav" aria-label="项目目录">
      <header>
        <span>项目目录</span>
        <button
          type="button"
          aria-label="添加分类"
          disabled={state.plan.categories.length >= MAX_PLAN_CATEGORIES}
          title={
            state.plan.categories.length >= MAX_PLAN_CATEGORIES
              ? "一个计划最多可包含 50 个分类"
              : undefined
          }
          onClick={() =>
            dispatch({
              type: "category-added",
              input: { id: createId(), name: "新分类", icon: "＋" },
              metadata: createMetadata(),
            })
          }
        >
          ＋
        </button>
      </header>
      <button
        className={state.activeCategoryId === null && !state.searchQuery ? "is-active" : ""}
        type="button"
        onClick={() => dispatch({ type: "navigate-pinned" })}
      >
        <b aria-hidden="true">⌖</b>
        <span>
          已置顶<small>我的主页</small>
        </span>
        <em>{String(pinnedCount).padStart(2, "0")}</em>
      </button>
      <p>全部分类</p>
      {state.plan.categories.map((category) => {
        const summary = summaries.find((item) => item.categoryId === category.id);
        return (
          <button
            className={
              state.activeCategoryId === category.id && !state.searchQuery ? "is-active" : ""
            }
            type="button"
            key={category.id}
            onClick={() => dispatch({ type: "navigate-category", categoryId: category.id })}
          >
            <b aria-hidden="true">{category.icon}</b>
            <span>
              {category.name}
              <small>{summary?.goalCount ?? 0} 项</small>
            </span>
            <em>{formatMoney(summary?.subtotalCents ?? 0)}</em>
          </button>
        );
      })}
      <footer>
        <span>{totalGoals} 个目标</span>
        <b>{formatMoney(totalCents)} / 月</b>
        <small>置顶 {formatMoney(selectPinnedSubtotalCents(state.plan))}</small>
      </footer>
    </nav>
  );
}
