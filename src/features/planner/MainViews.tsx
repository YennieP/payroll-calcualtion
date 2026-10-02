import type { Dispatch } from "react";

import type { AppAction, AppState } from "../../app/appReducer";
import {
  countPlanGoals,
  MAX_GOALS_PER_CATEGORY,
  MAX_PLAN_GOALS,
  selectCategorySubtotalCents,
  selectPinnedSubtotalCents,
  selectTotalMonthlyGoalCents,
} from "../../domain/plan";
import type { Category, Goal } from "../../domain/plan";
import { formatMoney, formatPercent } from "./formatters";
import { GoalRow } from "./GoalRow";
import { getThemeOption } from "./themeOptions";

interface MainViewsProps {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  createId: () => string;
  createMetadata: () => { updatedAt: string; updatedByDevice: string };
}

interface GoalWithCategory {
  goal: Goal;
  category: Category;
}

function allGoals(state: AppState): GoalWithCategory[] {
  return state.plan.categories.flatMap((category) =>
    category.goals.map((goal) => ({ goal, category })),
  );
}

function PageEyebrow({ state, section }: { state: AppState; section: string }) {
  return (
    <div className="page-eyebrow">
      <span>{getThemeOption(state.plan.preferences.themeId).kicker}</span>
      <b>{section}</b>
    </div>
  );
}

function SearchView({ state, dispatch, createMetadata }: MainViewsProps) {
  const query = state.searchQuery.trim().toLocaleLowerCase("zh-CN");
  const results = allGoals(state).filter(
    ({ goal, category }) =>
      goal.name.toLocaleLowerCase("zh-CN").includes(query) ||
      category.name.toLocaleLowerCase("zh-CN").includes(query),
  );

  return (
    <section className="content-view search-view">
      <PageEyebrow state={state} section="SEARCH RESULTS" />
      <div className="page-title">
        <div>
          <h1>搜索结果</h1>
          <p>
            “{state.searchQuery}”找到 {results.length} 个目标；点击分类可以回到完整编辑页。
          </p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => dispatch({ type: "search-changed", query: "" })}
        >
          清除搜索
        </button>
      </div>
      {results.length > 0 ? (
        <>
          <div className="table-head">
            <span>目标名称</span>
            <span>所属分类</span>
            <span>每月金额</span>
            <span />
          </div>
          <div className="goal-rows">
            {results.map(({ goal, category }) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                category={category}
                categories={state.plan.categories}
                dispatch={dispatch}
                createMetadata={createMetadata}
                constraintSequence={state.constraintSequence}
                showSource
              />
            ))}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <strong>没有匹配的目标</strong>
          <p>可以搜索目标名称或分类名称。</p>
        </div>
      )}
    </section>
  );
}

function PinnedManager({ state, dispatch, createMetadata }: MainViewsProps) {
  return (
    <section className="inline-panel pinned-manager" aria-label="管理置顶">
      <header>
        <div>
          <strong>管理置顶</strong>
          <small>勾选需要在主页快速调整的目标</small>
        </div>
        <button
          type="button"
          aria-label="关闭管理置顶"
          onClick={() => dispatch({ type: "panel-toggled", panel: "pinned" })}
        >
          ×
        </button>
      </header>
      <div className="pin-picker">
        {state.plan.categories.map((category) => (
          <fieldset key={category.id}>
            <legend>{category.name}</legend>
            {category.goals.map((goal) => (
              <label key={goal.id}>
                <input
                  type="checkbox"
                  checked={goal.pinned}
                  onChange={() =>
                    dispatch({
                      type: "goal-updated",
                      categoryId: category.id,
                      goalId: goal.id,
                      changes: { pinned: !goal.pinned },
                      metadata: createMetadata(),
                    })
                  }
                />
                <span>{goal.name}</span>
                <small>{formatMoney(goal.monthlyAmountCents)}</small>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </section>
  );
}

function PinnedView(props: MainViewsProps) {
  const { state, dispatch, createMetadata } = props;
  const pinned = allGoals(state).filter(({ goal }) => goal.pinned);
  const pinnedSubtotal = selectPinnedSubtotalCents(state.plan);
  const total = selectTotalMonthlyGoalCents(state.plan);
  const categoryCount = new Set(pinned.map(({ category }) => category.id)).size;

  return (
    <section className="content-view pinned-view">
      <PageEyebrow state={state} section="HOME / PINNED" />
      <div className="page-title">
        <div>
          <h1>已置顶</h1>
          <p>快速调整你最常关注的生活目标。</p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => dispatch({ type: "panel-toggled", panel: "pinned" })}
        >
          管理置顶
        </button>
      </div>
      {state.managePinnedOpen ? <PinnedManager {...props} /> : null}
      <div className="summary-stats">
        <article>
          <span>置顶项目</span>
          <strong>{String(pinned.length).padStart(2, "0")}</strong>
          <small>来自 {categoryCount} 个生活分类</small>
        </article>
        <article>
          <span>置顶小计</span>
          <strong>{formatMoney(pinnedSubtotal)}</strong>
          <small>占全部目标 {formatPercent(total > 0 ? pinnedSubtotal / total : 0)}</small>
        </article>
      </div>
      <div className="table-head">
        <span>目标名称</span>
        <span>所属分类</span>
        <span>每月金额</span>
        <span />
      </div>
      {pinned.length > 0 ? (
        <div className="goal-rows">
          {pinned.map(({ goal, category }, index) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              category={category}
              categories={state.plan.categories}
              dispatch={dispatch}
              createMetadata={createMetadata}
              constraintSequence={state.constraintSequence}
              showSource
              isFirst={index === 0}
              isLast={index === pinned.length - 1}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>主页还没有置顶目标</strong>
          <p>进入任一分类，点击目标左侧的置顶按钮即可加入。</p>
        </div>
      )}
      <div className="info-note">
        <span aria-hidden="true">i</span>
        取消置顶只会移出主页，不会删除原项目。
      </div>
    </section>
  );
}

function CategorySettings({
  state,
  dispatch,
  createMetadata,
  category,
}: MainViewsProps & { category: Category }) {
  return (
    <section className="inline-panel category-settings" aria-label="分类设置">
      <header>
        <strong>分类设置</strong>
        <button
          type="button"
          aria-label="关闭分类设置"
          onClick={() => dispatch({ type: "panel-toggled", panel: "category" })}
        >
          ×
        </button>
      </header>
      <label>
        <span>名称</span>
        <input
          key={`${category.id}:${category.name}:${state.constraintSequence}`}
          defaultValue={category.name}
          maxLength={120}
          onBlur={(event) =>
            dispatch({
              type: "category-updated",
              categoryId: category.id,
              name: event.target.value,
              icon: category.icon,
              metadata: createMetadata(),
            })
          }
        />
      </label>
      <label>
        <span>标记</span>
        <input
          key={`${category.id}:${category.icon}:${state.constraintSequence}`}
          defaultValue={category.icon}
          maxLength={4}
          onBlur={(event) =>
            dispatch({
              type: "category-updated",
              categoryId: category.id,
              name: category.name,
              icon: event.target.value,
              metadata: createMetadata(),
            })
          }
        />
      </label>
      <div className="settings-actions">
        <button
          type="button"
          disabled={category.order === 0}
          onClick={() =>
            dispatch({
              type: "category-moved",
              categoryId: category.id,
              direction: -1,
              metadata: createMetadata(),
            })
          }
        >
          上移分类
        </button>
        <button
          type="button"
          disabled={category.order === state.plan.categories.length - 1}
          onClick={() =>
            dispatch({
              type: "category-moved",
              categoryId: category.id,
              direction: 1,
              metadata: createMetadata(),
            })
          }
        >
          下移分类
        </button>
        <button
          className="danger-action"
          type="button"
          disabled={state.plan.categories.length === 1}
          onClick={() =>
            dispatch({
              type: "category-deleted",
              categoryId: category.id,
              metadata: createMetadata(),
            })
          }
        >
          删除分类及目标
        </button>
      </div>
    </section>
  );
}

function CategoryView(props: MainViewsProps & { category: Category }) {
  const { state, dispatch, createId, createMetadata, category } = props;
  const subtotal = selectCategorySubtotalCents(state.plan, category.id);
  const total = selectTotalMonthlyGoalCents(state.plan);
  const pinnedCount = category.goals.filter((goal) => goal.pinned).length;
  const visibleCount = state.visibleGoalCounts[category.id] ?? 6;
  const visibleGoals = category.goals.slice(0, visibleCount);
  const planGoalCount = countPlanGoals(state.plan);
  const goalLimitReached =
    category.goals.length >= MAX_GOALS_PER_CATEGORY || planGoalCount >= MAX_PLAN_GOALS;

  return (
    <section className="content-view category-view">
      <PageEyebrow state={state} section="EDITING CATEGORY" />
      <div className="page-title category-title">
        <div>
          <h1>{category.name}</h1>
          <p>
            {category.goals.length} 个项目 · {formatMoney(subtotal)} / 月 · 占全部目标{" "}
            {formatPercent(total > 0 ? subtotal / total : 0, 0)}
          </p>
        </div>
        <button
          className="primary-button"
          type="button"
          disabled={goalLimitReached}
          title={goalLimitReached ? "已达到当前计划的目标数量上限" : undefined}
          onClick={() =>
            dispatch({
              type: "goal-added",
              categoryId: category.id,
              input: {
                id: createId(),
                name: "新目标",
                monthlyAmountCents: 50_000,
                budgetMode: "monthly-fixed",
              },
              metadata: createMetadata(),
            })
          }
        >
          ＋ 添加项目
        </button>
      </div>
      <div className="category-summary">
        <div className="category-icon" aria-hidden="true">
          {category.icon}
        </div>
        <div>
          <span>分类小计</span>
          <strong>{formatMoney(subtotal)}</strong>
        </div>
        <div>
          <span>已置顶</span>
          <strong>{pinnedCount} 项</strong>
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: "panel-toggled", panel: "category" })}
        >
          ⚙ 分类设置
        </button>
      </div>
      {state.categorySettingsOpen ? <CategorySettings {...props} /> : null}
      <div className="table-head">
        <span>目标名称</span>
        <span>预算方式</span>
        <span>每月金额</span>
        <span />
      </div>
      {category.goals.length > 0 ? (
        <div className="goal-rows">
          {visibleGoals.map((goal, index) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              category={category}
              categories={state.plan.categories}
              dispatch={dispatch}
              createMetadata={createMetadata}
              constraintSequence={state.constraintSequence}
              isFirst={index === 0}
              isLast={index === category.goals.length - 1}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>这个分类还是空的</strong>
          <p>添加第一个生活目标，收入结果会立刻更新。</p>
        </div>
      )}
      {visibleCount < category.goals.length ? (
        <button
          className="load-more"
          type="button"
          onClick={() => dispatch({ type: "more-goals-revealed", categoryId: category.id })}
        >
          显示其余 {category.goals.length - visibleCount} 个项目
        </button>
      ) : null}
    </section>
  );
}

export function MainViews(props: MainViewsProps) {
  const { state } = props;
  if (state.searchQuery.trim()) return <SearchView {...props} />;
  if (state.activeCategoryId === null) return <PinnedView {...props} />;
  const category = state.plan.categories.find((item) => item.id === state.activeCategoryId);
  return category ? <CategoryView {...props} category={category} /> : <PinnedView {...props} />;
}
