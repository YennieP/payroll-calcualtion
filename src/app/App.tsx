import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { LocalPlanRepository } from "../adapters/local/LocalPlanRepository";
import { MemoryPlanRepository } from "../adapters/local/MemoryPlanRepository";
import { BrowserDeviceIdentity } from "../adapters/local/BrowserDeviceIdentity";
import { createSamplePlan } from "../application/samplePlan";
import { importPlanJson } from "../application/planTransfer";
import {
  SyncedPlanRepository,
  type CloudSyncSnapshot,
} from "../application/sync/SyncedPlanRepository";
import { parsePlanDocument, type PlanDocument } from "../domain/plan";
import { AccountControl, type SignOutStrategy } from "../features/auth/AccountControl";
import { Planner } from "../features/planner/Planner";
import type { Account, AuthProvider } from "../ports/AuthProvider";
import type { CloudRuntime } from "../ports/CloudRuntime";
import {
  LocalPlanRecoveryError,
  type LocalPlanSyncRepository,
} from "../ports/LocalPlanSyncRepository";
import type { PlanRepository } from "../ports/PlanRepository";
import { RemotePlanReadError, type RemotePlanReadErrorKind } from "../ports/RemotePlanRepository";
import { appReducer, createInitialAppState } from "./appReducer";
import { loadFirebaseRuntime } from "./firebaseBootstrap";

const LOCAL_ACCOUNT_ID = "anonymous-local";
const CLOUD_FLUSH_DEBOUNCE_MS = 250;

export interface AppProps {
  repository?: LocalPlanSyncRepository;
  deviceId?: string;
  cloudRuntime?: CloudRuntime | null;
}

interface PlannerSessionProps {
  repository: PlanRepository;
  accountId: string;
  deviceId: string;
  authProvider?: AuthProvider;
  account: Account | null;
  sync: CloudSyncSnapshot | null;
  onSignOut?: (strategy: SignOutStrategy) => Promise<void>;
  hasPreloadedPlan?: boolean;
  preloadedPlan?: PlanDocument | null;
}

interface CloudPreparation {
  accountId: string;
  status: "checking" | "import-offer" | "ready" | "error";
  anonymousPlan: PlanDocument | null;
  preloadedPlan: PlanDocument | null;
  message: string | null;
  errorKind: RemotePlanReadErrorKind | null;
  recoveryJson: string | null;
  recoverySource: "local" | "remote" | null;
  recoveryAccountId: string | null;
}

interface AuthSession {
  runtime: CloudRuntime;
  account: Account | null;
}

interface SyncSession {
  repository: SyncedPlanRepository;
  snapshot: CloudSyncSnapshot;
}

interface CacheCleanupState {
  accountId: string;
  status: "clearing" | "error";
  message: string | null;
}

function createUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const tail = Math.floor(Math.random() * 1_000_000_000_000)
    .toString()
    .padStart(12, "0");
  return `40000000-0000-4000-8000-${tail}`;
}

function createDefaultRepository(): LocalPlanSyncRepository {
  return globalThis.indexedDB
    ? new LocalPlanRepository(globalThis.indexedDB)
    : new MemoryPlanRepository();
}

function createPersistentDeviceId(): string {
  try {
    return new BrowserDeviceIdentity(globalThis.localStorage, createUuid).getOrCreate();
  } catch {
    return createUuid();
  }
}

function downloadRecoveryJson(source: string) {
  const blob = new Blob([source], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `worthwhile-recovery-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function PlanRecoveryGate({
  message,
  recoveryJson,
  busy,
  onClear,
}: {
  message: string;
  recoveryJson: string;
  busy: boolean;
  onClear: () => Promise<void>;
}) {
  return (
    <div className="planner-stage session-gate" data-theme="rouge">
      <section className="session-gate-card" role="alert" aria-label="恢复本机计划">
        <span>WORTHWHILE · RECOVERY</span>
        <h1>本机计划需要恢复</h1>
        <p>{message} 清理前，原始记录会完整保留在 IndexedDB 中。</p>
        <div>
          <button type="button" disabled={busy} onClick={() => downloadRecoveryJson(recoveryJson)}>
            导出原始计划 JSON
          </button>
          <button type="button" disabled={busy} onClick={() => void onClear()}>
            清除此设备副本并继续
          </button>
        </div>
      </section>
    </div>
  );
}

function PlannerSession({
  repository,
  accountId,
  deviceId,
  authProvider,
  account,
  sync,
  onSignOut,
  hasPreloadedPlan = false,
  preloadedPlan = null,
}: PlannerSessionProps) {
  const [state, dispatch] = useReducer(
    appReducer,
    createInitialAppState(createSamplePlan(deviceId), deviceId),
  );
  const [isOnline, setIsOnline] = useState(() => globalThis.navigator?.onLine ?? true);
  const [localRecovery, setLocalRecovery] = useState<LocalPlanRecoveryError | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const loadStarted = useRef(false);
  const active = useRef(true);
  const cloudFlushTimer = useRef<number | null>(null);
  const localSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const lastQueuedEditSequence = useRef(-1);
  const persistedRevision = useRef(0);
  const localSaveError = useRef<unknown>(null);

  const createMetadata = useCallback(
    () => ({ updatedAt: new Date().toISOString(), updatedByDevice: deviceId }),
    [deviceId],
  );

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (cloudFlushTimer.current !== null) {
        globalThis.clearTimeout(cloudFlushTimer.current);
        cloudFlushTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (state.saveStatus === "saved") persistedRevision.current = state.plan.revision;
  }, [state.plan.revision, state.saveStatus]);

  useEffect(() => {
    if (loadStarted.current) return;
    loadStarted.current = true;
    if (hasPreloadedPlan) {
      if (preloadedPlan) {
        dispatch({ type: "plan-loaded", plan: preloadedPlan, isNew: false });
      } else {
        const startingPlan = createSamplePlan(deviceId);
        repository
          .replace(accountId, startingPlan)
          .then(() => dispatch({ type: "plan-loaded", plan: startingPlan, isNew: false }))
          .catch((error: unknown) =>
            dispatch({
              type: "storage-failed",
              message: error instanceof Error ? error.message : "未知 IndexedDB 错误。",
            }),
          );
      }
      return;
    }
    repository
      .load(accountId)
      .then((stored) =>
        dispatch({
          type: "plan-loaded",
          plan: stored ?? createSamplePlan(deviceId),
          isNew: stored === null,
        }),
      )
      .catch((error: unknown) => {
        if (error instanceof LocalPlanRecoveryError) {
          setLocalRecovery(error);
          return;
        }
        dispatch({
          type: "storage-failed",
          message: error instanceof Error ? error.message : "未知 IndexedDB 错误。",
        });
      });
  }, [accountId, deviceId, hasPreloadedPlan, preloadedPlan, repository]);

  useEffect(
    () =>
      repository.subscribe(accountId, (remote) => {
        dispatch(
          remote
            ? { type: "remote-received", remote }
            : { type: "plan-deleted", replacement: createSamplePlan(deviceId) },
        );
      }),
    [accountId, deviceId, repository],
  );

  const flushCloud = useCallback(async () => {
    if (!(repository instanceof SyncedPlanRepository)) return;
    const result = await repository.flush(accountId);
    if (!active.current) return;
    if (result.status === "conflict") {
      dispatch({ type: "save-conflicted", remote: result.remote });
    } else if (result.status === "deleted") {
      dispatch({ type: "plan-deleted", replacement: createSamplePlan(deviceId) });
    }
  }, [accountId, deviceId, repository]);

  const scheduleCloudFlush = useCallback(() => {
    if (!(repository instanceof SyncedPlanRepository)) return;
    if (cloudFlushTimer.current !== null) globalThis.clearTimeout(cloudFlushTimer.current);
    cloudFlushTimer.current = globalThis.setTimeout(() => {
      cloudFlushTimer.current = null;
      void flushCloud();
    }, CLOUD_FLUSH_DEBOUNCE_MS);
  }, [flushCloud, repository]);

  useEffect(() => {
    if (
      state.saveStatus !== "local-change" ||
      state.editSequence <= lastQueuedEditSequence.current
    ) {
      return;
    }
    const snapshot = state.plan;
    const editSequence = state.editSequence;
    lastQueuedEditSequence.current = editSequence;
    dispatch({ type: "save-started" });

    localSaveQueue.current = localSaveQueue.current
      .catch(() => undefined)
      .then(async () => {
        localSaveError.current = null;
        const expectedRevision = Math.max(snapshot.revision, persistedRevision.current);
        const result = await repository.save(
          accountId,
          { ...snapshot, revision: expectedRevision },
          expectedRevision,
        );
        if (result.status === "saved") persistedRevision.current = result.revision;
        if (!active.current) return;
        if (result.status === "saved") {
          dispatch({ type: "plan-saved", revision: result.revision, editSequence });
          scheduleCloudFlush();
        } else if (result.status === "conflict") {
          dispatch({ type: "save-conflicted", remote: result.remote });
        } else {
          dispatch({ type: "plan-deleted", replacement: createSamplePlan(deviceId) });
        }
      })
      .catch((error: unknown) => {
        localSaveError.current = error;
        if (!active.current) return;
        dispatch({
          type: "storage-failed",
          message: error instanceof Error ? error.message : "未知 IndexedDB 错误。",
        });
      });
  }, [
    accountId,
    deviceId,
    repository,
    scheduleCloudFlush,
    state.editSequence,
    state.plan,
    state.saveStatus,
  ]);

  useEffect(() => {
    const online = () => {
      setIsOnline(true);
      if (cloudFlushTimer.current !== null) {
        globalThis.clearTimeout(cloudFlushTimer.current);
        cloudFlushTimer.current = null;
      }
      void flushCloud();
    };
    const offline = () => setIsOnline(false);
    globalThis.addEventListener("online", online);
    globalThis.addEventListener("offline", offline);
    return () => {
      globalThis.removeEventListener("online", online);
      globalThis.removeEventListener("offline", offline);
    };
  }, [flushCloud]);

  const acceptRemote = async () => {
    const remote = state.conflictingPlan;
    if (!remote) return;
    if (repository instanceof SyncedPlanRepository) {
      await repository.acceptRemote(accountId, remote);
    } else {
      await repository.replace(accountId, remote);
    }
    dispatch({ type: "remote-accepted" });
  };

  const keepLocal = async () => {
    const remote = state.conflictingPlan;
    if (!remote) return;
    if (repository instanceof SyncedPlanRepository) {
      await repository.prepareLocalConflictResolution(accountId, state.plan, remote.revision);
    } else {
      await repository.replace(accountId, { ...state.plan, revision: remote.revision });
    }
    dispatch({ type: "local-kept" });
  };

  const importPlan = async (source: string) => {
    const imported = importPlanJson(source);
    const prepared = parsePlanDocument({
      ...imported,
      revision: state.plan.revision,
      updatedAt: new Date().toISOString(),
      updatedByDevice: deviceId,
    });
    dispatch({
      type: "plan-imported",
      plan: prepared,
    });
  };

  const deletePlan = async () => {
    await repository.delete(accountId);
  };

  const safelySignOut = async (strategy: SignOutStrategy) => {
    if (!onSignOut) return;
    if (cloudFlushTimer.current !== null) {
      globalThis.clearTimeout(cloudFlushTimer.current);
      cloudFlushTimer.current = null;
    }
    await localSaveQueue.current;
    if (strategy === "sync" && localSaveError.current) {
      throw new Error("sign-out/local-save-failed");
    }

    if (strategy === "sync" && repository instanceof SyncedPlanRepository) {
      if (state.saveStatus === "conflict") throw new Error("sign-out/conflict");
      if (!(globalThis.navigator?.onLine ?? true)) throw new Error("sign-out/offline");
      const result = await repository.flush(accountId);
      if (result.status === "conflict") {
        dispatch({ type: "save-conflicted", remote: result.remote });
        throw new Error("sign-out/conflict");
      }
      if (await repository.hasPendingChanges(accountId)) {
        throw new Error("sign-out/sync-failed");
      }
    }

    await onSignOut(strategy);
  };

  const clearLocalRecovery = async () => {
    if (!localRecovery) return;
    setRecoveryBusy(true);
    try {
      await repository.delete(accountId);
      const startingPlan = createSamplePlan(deviceId);
      await repository.replace(accountId, startingPlan);
      persistedRevision.current = startingPlan.revision;
      dispatch({ type: "plan-loaded", plan: startingPlan, isNew: false });
      setLocalRecovery(null);
    } finally {
      setRecoveryBusy(false);
    }
  };

  if (localRecovery) {
    return (
      <PlanRecoveryGate
        message={localRecovery.message}
        recoveryJson={localRecovery.recoveryJson}
        busy={recoveryBusy}
        onClear={clearLocalRecovery}
      />
    );
  }

  const accountControl = (
    <AccountControl
      provider={authProvider}
      account={account}
      sync={sync}
      saveStatus={state.saveStatus}
      plan={state.plan}
      onImportPlan={importPlan}
      onDeletePlan={deletePlan}
      onSignOut={onSignOut ? safelySignOut : undefined}
    />
  );

  return (
    <Planner
      state={state}
      dispatch={dispatch}
      createId={createUuid}
      createMetadata={createMetadata}
      isOnline={isOnline}
      accountControl={accountControl}
      onAcceptConflict={() => void acceptRemote()}
      onKeepConflict={() => void keepLocal()}
    />
  );
}

function SessionGate({
  account,
  preparation,
  busy,
  onImport,
  onSkip,
  onRetry,
  onExportRecovery,
  onClearRecovery,
  onDiscardAndSignOut,
}: {
  account: Account;
  preparation: CloudPreparation;
  busy: boolean;
  onImport: () => Promise<void>;
  onSkip: () => void;
  onRetry: () => void;
  onExportRecovery: () => void;
  onClearRecovery: () => Promise<void>;
  onDiscardAndSignOut: () => Promise<void>;
}) {
  return (
    <div className="planner-stage session-gate" data-theme="rouge">
      <section className="session-gate-card" role="dialog" aria-label="准备跨设备同步">
        <span>WORTHWHILE · CLOUD</span>
        <h1>
          {preparation.recoverySource === "local"
            ? "本机计划需要恢复"
            : preparation.status === "import-offer"
              ? "导入这台设备的计划？"
              : preparation.status === "error" && preparation.errorKind === "corrupt"
                ? "云端计划需要处理"
                : preparation.status === "error" && preparation.errorKind === "unavailable"
                  ? "云端暂时无法读取"
                  : preparation.status === "error"
                    ? "同步准备失败"
                    : "正在准备同步"}
        </h1>
        <p>
          {preparation.status === "import-offer"
            ? `账户 ${account.email ?? account.id} 的云端还没有计划。你可以把当前本机计划作为第一份云端版本。`
            : (preparation.message ?? "正在读取本机缓存和云端 revision…")}
        </p>
        {preparation.status === "import-offer" ? (
          <div>
            <button type="button" disabled={busy} onClick={() => void onImport()}>
              导入本机计划
            </button>
            <button type="button" disabled={busy} onClick={onSkip}>
              不导入，创建新计划
            </button>
          </div>
        ) : null}
        {preparation.status === "error" ? (
          <div>
            {preparation.recoverySource === "local" && preparation.recoveryJson ? (
              <>
                <button type="button" disabled={busy} onClick={onExportRecovery}>
                  导出原始计划 JSON
                </button>
                <button type="button" disabled={busy} onClick={() => void onClearRecovery()}>
                  清除此设备副本并重新读取
                </button>
              </>
            ) : (
              <>
                {preparation.recoverySource === "remote" && preparation.recoveryJson ? (
                  <button type="button" disabled={busy} onClick={onExportRecovery}>
                    导出云端原始计划 JSON
                  </button>
                ) : null}
                <button type="button" disabled={busy} onClick={onRetry}>
                  重新读取云端计划
                </button>
              </>
            )}
            <button type="button" disabled={busy} onClick={() => void onDiscardAndSignOut()}>
              放弃此账户的本机缓存并退出
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function AuthenticationGate({ message = "正在恢复账户状态…" }: { message?: string }) {
  return (
    <div className="planner-stage session-gate" data-theme="rouge">
      <section className="session-gate-card" role="status" aria-label="正在恢复账户">
        <span>WORTHWHILE · CLOUD</span>
        <h1>正在恢复账户</h1>
        <p>{message}</p>
      </section>
    </div>
  );
}

function CacheCleanupGate({
  state,
  onRetry,
}: {
  state: CacheCleanupState;
  onRetry: () => Promise<void>;
}) {
  return (
    <div className="planner-stage session-gate" data-theme="rouge">
      <section className="session-gate-card" role={state.status === "error" ? "alert" : "status"}>
        <span>WORTHWHILE · PRIVACY</span>
        <h1>{state.status === "error" ? "设备缓存尚未清理" : "正在安全退出"}</h1>
        <p>{state.message ?? "账户已退出，正在清除此设备上的私人计划缓存…"}</p>
        {state.status === "error" ? (
          <button type="button" onClick={() => void onRetry()}>
            重试清理设备缓存
          </button>
        ) : null}
      </section>
    </div>
  );
}

export function App({
  repository: suppliedRepository,
  deviceId: suppliedDeviceId,
  cloudRuntime: suppliedCloudRuntime,
}: AppProps) {
  const localRepository = useMemo(
    () => suppliedRepository ?? createDefaultRepository(),
    [suppliedRepository],
  );
  const deviceId = useMemo(
    () => suppliedDeviceId ?? createPersistentDeviceId(),
    [suppliedDeviceId],
  );
  const shouldAutoLoadCloud =
    suppliedRepository === undefined && suppliedCloudRuntime === undefined;
  const [cloudResolution, setCloudResolution] = useState<"loading" | "ready">(
    shouldAutoLoadCloud ? "loading" : "ready",
  );
  const [authResolved, setAuthResolved] = useState(
    suppliedCloudRuntime === undefined ? !shouldAutoLoadCloud : suppliedCloudRuntime === null,
  );
  const [cloudRuntime, setCloudRuntime] = useState<CloudRuntime | null>(
    suppliedCloudRuntime ?? null,
  );
  const [authSession, setAuthSession] = useState<AuthSession | null>(() =>
    suppliedCloudRuntime
      ? {
          runtime: suppliedCloudRuntime,
          account: suppliedCloudRuntime.auth.currentAccount(),
        }
      : null,
  );
  const [preparationResult, setPreparationResult] = useState<CloudPreparation | null>(null);
  const [preparationAttempt, setPreparationAttempt] = useState(0);
  const [gateBusy, setGateBusy] = useState(false);
  const [syncSession, setSyncSession] = useState<SyncSession | null>(null);
  const [cacheCleanup, setCacheCleanup] = useState<CacheCleanupState | null>(null);
  const signingOutAccountId = useRef<string | null>(null);

  const account = authSession?.runtime === cloudRuntime ? authSession.account : null;

  useEffect(() => {
    if (!shouldAutoLoadCloud) return;
    let cancelled = false;
    loadFirebaseRuntime()
      .then((runtime) => {
        if (cancelled) return;
        setCloudRuntime(runtime);
        setCloudResolution("ready");
        setAuthResolved(runtime === null);
      })
      .catch(() => {
        if (cancelled) return;
        setCloudRuntime(null);
        setCloudResolution("ready");
        setAuthResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [shouldAutoLoadCloud]);

  useEffect(() => {
    if (!cloudRuntime) return;
    return cloudRuntime.auth.onAuthChange((nextAccount) => {
      if (nextAccount === null && signingOutAccountId.current !== null) return;
      setAuthSession({ runtime: cloudRuntime, account: nextAccount });
      setAuthResolved(true);
    });
  }, [cloudRuntime]);

  const syncedRepository = useMemo(
    () =>
      cloudRuntime && account
        ? new SyncedPlanRepository(
            localRepository,
            cloudRuntime.plans,
            () => globalThis.navigator?.onLine ?? true,
          )
        : null,
    [account, cloudRuntime, localRepository],
  );

  useEffect(() => {
    if (!syncedRepository) return;
    return syncedRepository.subscribeSync((snapshot) => {
      setSyncSession({ repository: syncedRepository, snapshot });
    });
  }, [syncedRepository]);

  const syncSnapshot =
    syncedRepository && syncSession?.repository === syncedRepository ? syncSession.snapshot : null;

  useEffect(() => {
    if (!account || !syncedRepository) return;
    let cancelled = false;
    void (async () => {
      let recoveryAccountId: string | null = null;
      try {
        let accountPlan: PlanDocument | null;
        try {
          accountPlan = await syncedRepository.load(account.id);
        } catch (error: unknown) {
          if (error instanceof LocalPlanRecoveryError) recoveryAccountId = account.id;
          throw error;
        }

        let anonymousPlan: PlanDocument | null;
        try {
          anonymousPlan = await localRepository.load(LOCAL_ACCOUNT_ID);
        } catch (error: unknown) {
          if (error instanceof LocalPlanRecoveryError) recoveryAccountId = LOCAL_ACCOUNT_ID;
          throw error;
        }

        if (cancelled) return;
        setPreparationResult({
          accountId: account.id,
          status: !accountPlan && anonymousPlan ? "import-offer" : "ready",
          anonymousPlan,
          preloadedPlan: accountPlan,
          message: null,
          errorKind: null,
          recoveryJson: null,
          recoverySource: null,
          recoveryAccountId: null,
        });
      } catch (error: unknown) {
        if (cancelled) return;
        setPreparationResult({
          accountId: account.id,
          status: "error",
          anonymousPlan: null,
          preloadedPlan: null,
          message: error instanceof Error ? error.message : "无法准备同步。",
          errorKind: error instanceof RemotePlanReadError ? error.kind : null,
          recoveryJson:
            error instanceof LocalPlanRecoveryError || error instanceof RemotePlanReadError
              ? error.recoveryJson
              : null,
          recoverySource:
            error instanceof LocalPlanRecoveryError
              ? "local"
              : error instanceof RemotePlanReadError && error.recoveryJson
                ? "remote"
                : null,
          recoveryAccountId,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account, localRepository, preparationAttempt, syncedRepository]);

  const preparation: CloudPreparation | null = account
    ? preparationResult?.accountId === account.id
      ? preparationResult
      : {
          accountId: account.id,
          status: "checking",
          anonymousPlan: null,
          preloadedPlan: null,
          message: null,
          errorKind: null,
          recoveryJson: null,
          recoverySource: null,
          recoveryAccountId: null,
        }
    : null;

  const clearSignedOutCache = async (accountId: string) => {
    setCacheCleanup({ accountId, status: "clearing", message: null });
    try {
      await localRepository.delete(accountId);
      signingOutAccountId.current = null;
      setPreparationResult(null);
      setAuthSession(cloudRuntime ? { runtime: cloudRuntime, account: null } : null);
      setCacheCleanup(null);
    } catch {
      setCacheCleanup({
        accountId,
        status: "error",
        message: "账户已经退出，但本机私人缓存尚未清除。请保持此页面打开并重试。",
      });
      throw new Error("sign-out/cache-cleanup-failed");
    }
  };

  const signOut = async () => {
    if (!cloudRuntime || !account) return;
    const accountId = account.id;
    signingOutAccountId.current = accountId;
    try {
      await cloudRuntime.auth.signOut();
    } catch (error) {
      signingOutAccountId.current = null;
      setCacheCleanup(null);
      throw error;
    }
    await clearSignedOutCache(accountId);
  };

  if (cloudResolution === "loading" || (cloudRuntime !== null && !authResolved)) {
    return <AuthenticationGate />;
  }

  if (cacheCleanup) {
    return (
      <CacheCleanupGate
        state={cacheCleanup}
        onRetry={() => clearSignedOutCache(cacheCleanup.accountId)}
      />
    );
  }

  if (account && cloudRuntime && syncedRepository && preparation?.accountId === account.id) {
    if (preparation.status !== "ready") {
      return (
        <SessionGate
          account={account}
          preparation={preparation}
          busy={gateBusy}
          onImport={async () => {
            const anonymousPlan = preparation.anonymousPlan;
            if (!anonymousPlan) return;
            setGateBusy(true);
            try {
              const result = await syncedRepository.importPlan(account.id, {
                ...anonymousPlan,
                updatedAt: new Date().toISOString(),
                updatedByDevice: deviceId,
              });
              if (result.status === "conflict") {
                setPreparationResult({
                  ...preparation,
                  status: "ready",
                  preloadedPlan: result.remote,
                });
              } else {
                const imported = await localRepository.load(account.id);
                await localRepository.delete(LOCAL_ACCOUNT_ID);
                setPreparationResult({
                  ...preparation,
                  status: "ready",
                  preloadedPlan: imported,
                });
              }
            } catch (error: unknown) {
              setPreparationResult({
                ...preparation,
                status: "error",
                message: error instanceof Error ? error.message : "本机计划导入失败。",
              });
            } finally {
              setGateBusy(false);
            }
          }}
          onSkip={() => setPreparationResult({ ...preparation, status: "ready" })}
          onRetry={() => {
            setPreparationResult(null);
            setPreparationAttempt((attempt) => attempt + 1);
          }}
          onExportRecovery={() => {
            if (preparation.recoveryJson) downloadRecoveryJson(preparation.recoveryJson);
          }}
          onClearRecovery={async () => {
            setGateBusy(true);
            try {
              await localRepository.delete(preparation.recoveryAccountId ?? account.id);
              setPreparationResult(null);
              setPreparationAttempt((attempt) => attempt + 1);
            } finally {
              setGateBusy(false);
            }
          }}
          onDiscardAndSignOut={signOut}
        />
      );
    }

    return (
      <PlannerSession
        key={account.id}
        repository={syncedRepository}
        accountId={account.id}
        deviceId={deviceId}
        authProvider={cloudRuntime.auth}
        account={account}
        sync={syncSnapshot}
        onSignOut={signOut}
        hasPreloadedPlan
        preloadedPlan={preparation.preloadedPlan}
      />
    );
  }

  return (
    <PlannerSession
      key={LOCAL_ACCOUNT_ID}
      repository={localRepository}
      accountId={LOCAL_ACCOUNT_ID}
      deviceId={deviceId}
      authProvider={cloudRuntime?.auth}
      account={account}
      sync={syncSnapshot}
      onSignOut={account ? signOut : undefined}
    />
  );
}
