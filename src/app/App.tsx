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
import type { PlanDocument } from "../domain/plan";
import { AccountControl } from "../features/auth/AccountControl";
import { Planner } from "../features/planner/Planner";
import type { Account, AuthProvider } from "../ports/AuthProvider";
import type { CloudRuntime } from "../ports/CloudRuntime";
import type { LocalPlanSyncRepository } from "../ports/LocalPlanSyncRepository";
import type { PlanRepository } from "../ports/PlanRepository";
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
  onSignOut?: () => Promise<void>;
  hasPreloadedPlan?: boolean;
  preloadedPlan?: PlanDocument | null;
}

interface CloudPreparation {
  accountId: string;
  status: "checking" | "import-offer" | "ready" | "error";
  anonymousPlan: PlanDocument | null;
  preloadedPlan: PlanDocument | null;
  message: string | null;
}

interface AuthSession {
  runtime: CloudRuntime;
  account: Account | null;
}

interface SyncSession {
  repository: SyncedPlanRepository;
  snapshot: CloudSyncSnapshot;
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
  const loadStarted = useRef(false);
  const active = useRef(true);
  const cloudFlushTimer = useRef<number | null>(null);
  const localSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const lastQueuedEditSequence = useRef(-1);
  const persistedRevision = useRef(0);

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
      .catch((error: unknown) =>
        dispatch({
          type: "storage-failed",
          message: error instanceof Error ? error.message : "未知 IndexedDB 错误。",
        }),
      );
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
    dispatch({
      type: "plan-imported",
      plan: {
        ...imported,
        revision: state.plan.revision,
        updatedAt: new Date().toISOString(),
        updatedByDevice: deviceId,
      },
    });
  };

  const deletePlan = async () => {
    await repository.delete(accountId);
  };

  const accountControl = (
    <AccountControl
      provider={authProvider}
      account={account}
      sync={sync}
      plan={state.plan}
      onImportPlan={importPlan}
      onDeletePlan={deletePlan}
      onSignOut={onSignOut}
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
  onSignOut,
}: {
  account: Account;
  preparation: CloudPreparation;
  busy: boolean;
  onImport: () => Promise<void>;
  onSkip: () => void;
  onSignOut: () => Promise<void>;
}) {
  return (
    <div className="planner-stage session-gate" data-theme="rouge">
      <section className="session-gate-card" role="dialog" aria-label="准备跨设备同步">
        <span>WORTHWHILE · CLOUD</span>
        <h1>{preparation.status === "import-offer" ? "导入这台设备的计划？" : "正在准备同步"}</h1>
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
          <button type="button" disabled={busy} onClick={() => void onSignOut()}>
            退出账户并返回本机模式
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
  const [gateBusy, setGateBusy] = useState(false);
  const [syncSession, setSyncSession] = useState<SyncSession | null>(null);

  const account = authSession?.runtime === cloudRuntime ? authSession.account : null;

  useEffect(() => {
    if (!shouldAutoLoadCloud) return;
    let cancelled = false;
    loadFirebaseRuntime()
      .then((runtime) => {
        if (!cancelled) setCloudRuntime(runtime);
      })
      .catch(() => {
        if (!cancelled) setCloudRuntime(null);
      });
    return () => {
      cancelled = true;
    };
  }, [shouldAutoLoadCloud]);

  useEffect(() => {
    if (!cloudRuntime) return;
    return cloudRuntime.auth.onAuthChange((nextAccount) => {
      setAuthSession({ runtime: cloudRuntime, account: nextAccount });
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
    Promise.all([syncedRepository.load(account.id), localRepository.load(LOCAL_ACCOUNT_ID)]).then(
      ([accountPlan, anonymousPlan]) => {
        if (cancelled) return;
        setPreparationResult({
          accountId: account.id,
          status: !accountPlan && anonymousPlan ? "import-offer" : "ready",
          anonymousPlan,
          preloadedPlan: accountPlan,
          message: null,
        });
      },
      (error: unknown) => {
        if (cancelled) return;
        setPreparationResult({
          accountId: account.id,
          status: "error",
          anonymousPlan: null,
          preloadedPlan: null,
          message: error instanceof Error ? error.message : "无法准备同步。",
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [account, localRepository, syncedRepository]);

  const preparation: CloudPreparation | null = account
    ? preparationResult?.accountId === account.id
      ? preparationResult
      : {
          accountId: account.id,
          status: "checking",
          anonymousPlan: null,
          preloadedPlan: null,
          message: null,
        }
    : null;

  const signOut = async () => {
    if (!cloudRuntime || !account) return;
    await localRepository.delete(account.id);
    await cloudRuntime.auth.signOut();
  };

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
          onSignOut={signOut}
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
