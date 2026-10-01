import type { Dispatch } from "react";

import type { AppAction, AppState } from "../../app/appReducer";
import { useThemeFonts } from "../../fonts/useThemeFonts";
import { PwaStatus } from "../../pwa/PwaStatus";
import { IncomePanel } from "./IncomePanel";
import { MainViews } from "./MainViews";
import { Navigation } from "./Navigation";
import { TopBar } from "./TopBar";

interface PlannerProps {
  state: AppState;
  dispatch: Dispatch<AppAction>;
  createId: () => string;
  createMetadata: () => { updatedAt: string; updatedByDevice: string };
  isOnline: boolean;
}

export function Planner(props: PlannerProps) {
  const { state, dispatch } = props;
  const themeFonts = useThemeFonts(state.plan.preferences.themeId);
  return (
    <div className="planner-stage" data-theme={state.plan.preferences.themeId}>
      <div
        className="planner-app"
        data-theme={state.plan.preferences.themeId}
        data-font-status={themeFonts.status}
        data-font-failures={themeFonts.failures.map((failure) => failure.familyId).join(",")}
      >
        <TopBar {...props} />
        {state.saveStatus === "conflict" ? (
          <section className="conflict-banner" role="alert">
            <div>
              <strong>检测到另一份较新的本机版本</strong>
              <span>请选择保留当前修改，或载入另一份版本。系统不会静默覆盖。</span>
            </div>
            <button type="button" onClick={() => dispatch({ type: "local-kept" })}>
              保留当前修改
            </button>
            <button type="button" onClick={() => dispatch({ type: "remote-accepted" })}>
              载入较新版本
            </button>
          </section>
        ) : null}
        {state.saveStatus === "error" ? (
          <section className="error-banner" role="alert">
            <strong>本机存储暂不可用。</strong>
            <span>{state.saveError} 当前页面仍可计算和编辑，请不要在恢复前关闭。</span>
          </section>
        ) : null}
        <div className="planner-layout">
          <Navigation {...props} />
          <main className="planner-main" aria-live="polite">
            <MainViews {...props} />
          </main>
          <div className="decor-rail" aria-hidden="true" />
          <IncomePanel state={state} dispatch={dispatch} />
        </div>
        {state.saveStatus === "loading" ? (
          <div className="loading-cover" role="status">
            正在读取本机计划…
          </div>
        ) : null}
      </div>
      <PwaStatus saveStatus={state.saveStatus} />
    </div>
  );
}
