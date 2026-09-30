import { useReducer } from "react";

import { AppShell } from "../components/AppShell/AppShell";
import { appReducer, initialAppState } from "./appReducer";

export function App() {
  const [state] = useReducer(appReducer, initialAppState);

  return (
    <AppShell themeId={state.themeId}>
      <p className="eyebrow">FOUNDATION · READY</p>
      <h1>正式仓库骨架已初始化</h1>
      <p>验收 Demo 已安全保存。下一阶段将在既定模块边界内迁移税务内核和规划领域模型。</p>
      <dl className="foundation-status" aria-label="初始化状态">
        <div>
          <dt>应用</dt>
          <dd>React · TypeScript · Vite</dd>
        </div>
        <div>
          <dt>跨端</dt>
          <dd>PWA shell</dd>
        </div>
        <div>
          <dt>同步</dt>
          <dd>Portable adapters · pending</dd>
        </div>
      </dl>
    </AppShell>
  );
}
