import type { SaveStatus } from "../app/appReducer";
import { usePwaLifecycle, type PwaLifecycleState } from "./usePwaLifecycle";

interface PwaStatusProps {
  saveStatus: SaveStatus;
}

interface PwaStatusViewProps extends PwaLifecycleState {
  saveStatus: SaveStatus;
}

const NOTICE_COPY = {
  "install-ready": {
    title: "安装 Worthwhile",
    description: "安装后可以像应用一样打开，并在离线时继续规划。",
  },
  "ios-install": {
    title: "添加到主屏幕",
    description: "在 Safari 中点击分享按钮，再选择“添加到主屏幕”。",
  },
  "offline-ready": {
    title: "已经可以离线使用",
    description: "应用外壳、七套主题和字体已经保存在此设备。",
  },
  "update-ready": {
    title: "新版本已经准备好",
    description: "确认本机修改保存后再更新，页面将重新载入。",
  },
  updating: {
    title: "正在更新",
    description: "正在切换到最新版本，请不要关闭页面。",
  },
  error: {
    title: "离线功能暂时不可用",
    description: "应用仍可继续使用；联网后刷新页面可以重试。",
  },
} as const;

export function PwaStatusView({
  notice,
  errorMessage,
  install,
  update,
  dismiss,
  saveStatus,
}: PwaStatusViewProps) {
  if (!notice) return null;
  const copy = NOTICE_COPY[notice];
  const canUpdate = saveStatus === "saved";
  const isBusy = notice === "updating";
  const canDismiss = !isBusy && notice !== "update-ready";

  return (
    <aside
      className={`pwa-notice is-${notice}`}
      role={notice === "error" ? "alert" : "status"}
      aria-live={notice === "error" ? "assertive" : "polite"}
    >
      <div>
        <strong>{copy.title}</strong>
        <span>{errorMessage ?? copy.description}</span>
      </div>
      {notice === "install-ready" ? (
        <button type="button" onClick={() => void install()}>
          安装
        </button>
      ) : null}
      {notice === "update-ready" ? (
        <button type="button" disabled={!canUpdate} onClick={() => void update()}>
          {canUpdate ? "立即更新" : "等待本机保存"}
        </button>
      ) : null}
      {canDismiss ? (
        <button className="pwa-dismiss" type="button" aria-label="关闭应用提示" onClick={dismiss}>
          ×
        </button>
      ) : null}
    </aside>
  );
}

export function PwaStatus({ saveStatus }: PwaStatusProps) {
  const lifecycle = usePwaLifecycle();
  return <PwaStatusView {...lifecycle} saveStatus={saveStatus} />;
}
