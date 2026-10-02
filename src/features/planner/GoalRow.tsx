import type { Dispatch } from "react";

import type { AppAction } from "../../app/appReducer";
import { MAX_GOALS_PER_CATEGORY, MAX_MONTHLY_GOAL_AMOUNT_CENTS } from "../../domain/plan";
import type { BudgetMode, Category, Goal } from "../../domain/plan";
import { BUDGET_MODE_LABELS, dollarsToCents } from "./formatters";

interface GoalRowProps {
  goal: Goal;
  category: Category;
  categories: Category[];
  dispatch: Dispatch<AppAction>;
  createMetadata: () => { updatedAt: string; updatedByDevice: string };
  showSource?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  constraintSequence: number;
}

export function GoalRow({
  goal,
  category,
  categories,
  dispatch,
  createMetadata,
  showSource = false,
  isFirst = false,
  isLast = false,
  constraintSequence,
}: GoalRowProps) {
  const update = (changes: Partial<Goal>) =>
    dispatch({
      type: "goal-updated",
      categoryId: category.id,
      goalId: goal.id,
      changes,
      metadata: createMetadata(),
    });

  return (
    <div className="goal-row" data-goal-id={goal.id}>
      <span className="goal-identity">
        <button
          className={`pin-button${goal.pinned ? " is-pinned" : ""}`}
          type="button"
          aria-label={`${goal.pinned ? "取消置顶" : "置顶"}${goal.name}`}
          aria-pressed={goal.pinned}
          onClick={() => update({ pinned: !goal.pinned })}
        >
          ⌖
        </button>
        <input
          key={`${goal.id}:${goal.name}:${constraintSequence}`}
          className="goal-name-input"
          defaultValue={goal.name}
          aria-label={`${goal.name}名称`}
          maxLength={120}
          onBlur={(event) => update({ name: event.target.value })}
        />
      </span>

      {showSource ? (
        <button
          className="source-button"
          type="button"
          onClick={() => dispatch({ type: "navigate-category", categoryId: category.id })}
        >
          {category.name} ↗
        </button>
      ) : (
        <select
          className="budget-select"
          value={goal.budgetMode}
          aria-label={`${goal.name}预算方式`}
          onChange={(event) => update({ budgetMode: event.target.value as BudgetMode })}
        >
          {Object.entries(BUDGET_MODE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      )}

      <label className="row-money-field">
        <span>$</span>
        <input
          key={`${goal.id}:${goal.monthlyAmountCents}:${constraintSequence}`}
          type="number"
          min="0"
          max={MAX_MONTHLY_GOAL_AMOUNT_CENTS / 100}
          step="10"
          defaultValue={goal.monthlyAmountCents / 100}
          aria-label={`${goal.name}每月金额`}
          onBlur={(event) => update({ monthlyAmountCents: dollarsToCents(event.target.value) })}
        />
      </label>

      <details className="goal-actions">
        <summary aria-label={`${goal.name}更多操作`}>···</summary>
        <div>
          <button
            type="button"
            disabled={isFirst}
            onClick={() =>
              dispatch({
                type: "goal-reordered",
                categoryId: category.id,
                goalId: goal.id,
                direction: -1,
                metadata: createMetadata(),
              })
            }
          >
            上移
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={() =>
              dispatch({
                type: "goal-reordered",
                categoryId: category.id,
                goalId: goal.id,
                direction: 1,
                metadata: createMetadata(),
              })
            }
          >
            下移
          </button>
          <label>
            移至分类
            <select
              value={category.id}
              aria-label={`移动${goal.name}到分类`}
              onChange={(event) =>
                dispatch({
                  type: "goal-moved",
                  categoryId: category.id,
                  goalId: goal.id,
                  targetCategoryId: event.target.value,
                  metadata: createMetadata(),
                })
              }
            >
              {categories.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                  disabled={
                    option.id !== category.id && option.goals.length >= MAX_GOALS_PER_CATEGORY
                  }
                >
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="danger-action"
            type="button"
            onClick={() =>
              dispatch({
                type: "goal-deleted",
                categoryId: category.id,
                goalId: goal.id,
                metadata: createMetadata(),
              })
            }
          >
            删除目标
          </button>
        </div>
      </details>
    </div>
  );
}
