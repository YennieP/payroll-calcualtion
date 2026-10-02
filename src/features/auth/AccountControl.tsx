import { useState, type ChangeEvent, type FormEvent } from "react";

import type { Account, AuthProvider } from "../../ports/AuthProvider";
import type { CloudSyncSnapshot } from "../../application/sync/SyncedPlanRepository";
import { exportPlanJson } from "../../application/planTransfer";
import type { SaveStatus } from "../../app/appReducer";
import type { PlanDocument } from "../../domain/plan";

type AuthMode = "sign-in" | "register" | "reset";
export type SignOutStrategy = "sync" | "discard";

export interface AccountControlProps {
  provider?: AuthProvider;
  account: Account | null;
  sync: CloudSyncSnapshot | null;
  saveStatus: SaveStatus;
  plan: PlanDocument;
  onImportPlan: (source: string) => Promise<void>;
  onDeletePlan: () => Promise<void>;
  onSignOut?: (strategy: SignOutStrategy) => Promise<void>;
}

const SYNC_LABELS: Record<CloudSyncSnapshot["status"], string> = {
  connecting: "正在连接",
  syncing: "正在同步",
  synced: "云端已同步",
  offline: "离线待同步",
  error: "同步失败",
  conflict: "同步冲突",
};

function readableAuthError(error: unknown): string {
  if (!(error instanceof Error)) return "账户操作失败，请稍后重试。";
  if (error.message.includes("auth/invalid-credential")) return "邮箱或密码不正确。";
  if (error.message.includes("auth/email-already-in-use")) return "这个邮箱已经注册。";
  if (error.message.includes("auth/weak-password")) return "密码至少需要 6 个字符。";
  if (error.message.includes("auth/invalid-email")) return "请输入有效的邮箱地址。";
  if (error.message.includes("sign-out/offline"))
    return "当前离线，无法确认云端同步。请先导出计划，或明确放弃未同步修改。";
  if (error.message.includes("sign-out/conflict"))
    return "请先解决同步冲突，或导出后明确放弃本机修改。";
  if (error.message.includes("sign-out/local-save-failed"))
    return "本机修改尚未安全保存，暂时不能退出。";
  if (error.message.includes("sign-out/sync-failed"))
    return "云端同步尚未完成，请重试、先导出计划，或明确放弃修改。";
  if (error.message.includes("sign-out/cache-cleanup-failed"))
    return "账户已退出，但此设备缓存清理失败，请重试清理。";
  return "账户操作失败，请稍后重试。";
}

export function AccountControl({
  provider,
  account,
  sync,
  saveStatus,
  plan,
  onImportPlan,
  onDeletePlan,
  onSignOut,
}: AccountControlProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!provider) return;
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "register") await provider.registerWithEmail(email, password);
      else if (mode === "reset") {
        await provider.sendPasswordResetEmail(email);
        setMessage("重置邮件已发送，请检查收件箱。");
      } else await provider.signInWithEmail(email, password);
      if (mode !== "reset") setOpen(false);
    } catch (error: unknown) {
      setMessage(readableAuthError(error));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async (strategy: SignOutStrategy) => {
    if (!onSignOut) return;
    setBusy(true);
    setMessage(null);
    try {
      await onSignOut(strategy);
      setConfirmSignOut(false);
      setOpen(false);
    } catch (error: unknown) {
      setMessage(readableAuthError(error));
    } finally {
      setBusy(false);
    }
  };

  const requiresSignOutChoice =
    account !== null && (saveStatus !== "saved" || sync?.status !== "synced");

  const exportPlan = () => {
    setDataMessage(null);
    try {
      const blob = new Blob([exportPlanJson(plan)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `worthwhile-plan-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setDataMessage("计划 JSON 已导出。文件仅保存在这台设备上。");
    } catch (error: unknown) {
      setDataMessage(error instanceof Error ? error.message : "无法导出当前计划。");
    }
  };

  const importPlan = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setDataMessage(null);
    try {
      await onImportPlan(await file.text());
      setDataMessage("计划已导入并保存为新的本机修改。");
    } catch (error: unknown) {
      setDataMessage(error instanceof Error ? error.message : "无法导入这个计划文件。");
    } finally {
      setBusy(false);
    }
  };

  const deletePlan = async () => {
    setBusy(true);
    setDataMessage(null);
    try {
      await onDeletePlan();
      setConfirmDelete(false);
      setDataMessage("原计划已删除。当前显示的是尚未保存的起始计划。");
    } catch {
      setDataMessage("删除失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="topbar-control account-control">
      <button
        className="compact-control"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">◎</span>
        <b>{account ? (account.email ?? "同步账户") : provider ? "跨设备同步" : "本机计划"}</b>
        <span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <section className="account-panel" role="dialog" aria-label="账户与同步">
          <header>
            <div>
              <strong>{account ? "账户与同步" : provider ? "跨设备同步" : "本机计划"}</strong>
              <small>
                {account && sync
                  ? SYNC_LABELS[sync.status]
                  : provider
                    ? "邮箱登录后可在手机与电脑间同步"
                    : "匿名使用，数据只保存在这台设备"}
              </small>
            </div>
            <button type="button" aria-label="关闭账户面板" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>
          {account ? (
            <div className="account-summary">
              <span>当前账户</span>
              <strong>{account.email ?? "未提供邮箱"}</strong>
              {sync?.error ? <p role="alert">{sync.error}</p> : null}
              {message ? <p role="alert">{message}</p> : null}
              {onSignOut ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    requiresSignOutChoice ? setConfirmSignOut(true) : void signOut("sync")
                  }
                >
                  退出并清除此设备缓存
                </button>
              ) : null}
              {confirmSignOut ? (
                <div className="delete-confirmation" role="alert">
                  <p>这份计划还有未确认的云端状态。退出前请选择如何处理本机修改。</p>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      saveStatus === "conflict" ||
                      sync?.status === "offline" ||
                      sync?.status === "conflict"
                    }
                    onClick={() => void signOut("sync")}
                  >
                    等待同步后退出
                  </button>
                  <button type="button" disabled={busy} onClick={exportPlan}>
                    先导出 JSON
                  </button>
                  <button type="button" disabled={busy} onClick={() => void signOut("discard")}>
                    放弃未同步修改并退出
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirmSignOut(false)}>
                    继续编辑
                  </button>
                </div>
              ) : null}
            </div>
          ) : provider ? (
            <>
              <div className="auth-tabs" role="tablist" aria-label="账户操作">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "sign-in"}
                  onClick={() => setMode("sign-in")}
                >
                  登录
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "register"}
                  onClick={() => setMode("register")}
                >
                  注册
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "reset"}
                  onClick={() => setMode("reset")}
                >
                  重置密码
                </button>
              </div>
              <form className="auth-form" onSubmit={(event) => void submit(event)}>
                <label>
                  <span>邮箱</span>
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
                {mode !== "reset" ? (
                  <label>
                    <span>密码</span>
                    <input
                      type="password"
                      autoComplete={mode === "register" ? "new-password" : "current-password"}
                      minLength={6}
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                ) : null}
                {message ? (
                  <p role={message.includes("已发送") ? "status" : "alert"}>{message}</p>
                ) : null}
                <button type="submit" disabled={busy}>
                  {busy
                    ? "请稍候…"
                    : mode === "register"
                      ? "创建账户"
                      : mode === "reset"
                        ? "发送重置邮件"
                        : "登录并同步"}
                </button>
              </form>
            </>
          ) : null}
          <section className="plan-data-tools" aria-label="计划数据管理">
            <div>
              <strong>数据管理</strong>
              <small>导入前会验证格式；文件中包含你的私人规划数据。</small>
            </div>
            <div className="plan-data-actions">
              <button type="button" disabled={busy} onClick={exportPlan}>
                导出 JSON
              </button>
              <label aria-disabled={busy}>
                导入 JSON
                <input
                  type="file"
                  accept="application/json,.json"
                  disabled={busy}
                  onChange={(event) => void importPlan(event)}
                />
              </label>
              {!confirmDelete ? (
                <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>
                  删除整份计划
                </button>
              ) : null}
            </div>
            {confirmDelete ? (
              <div className="delete-confirmation" role="alert">
                <p>这会删除当前本机计划；登录时也会删除云端副本。此操作无法撤销。</p>
                <button type="button" disabled={busy} onClick={() => void deletePlan()}>
                  确认删除
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>
                  取消
                </button>
              </div>
            ) : null}
            {dataMessage ? <p role="status">{dataMessage}</p> : null}
          </section>
        </section>
      ) : null}
    </div>
  );
}
