import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { LocalPlanRepository } from "../adapters/local/LocalPlanRepository";
import { MemoryPlanRepository } from "../adapters/local/MemoryPlanRepository";
import { createSamplePlan } from "../application/samplePlan";
import { Planner } from "../features/planner/Planner";
import type { PlanRepository } from "../ports/PlanRepository";
import { appReducer, createInitialAppState } from "./appReducer";

const LOCAL_ACCOUNT_ID = "anonymous-local";

export interface AppProps {
  repository?: PlanRepository;
  deviceId?: string;
}

function createUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const tail = Math.floor(Math.random() * 1_000_000_000_000)
    .toString()
    .padStart(12, "0");
  return `40000000-0000-4000-8000-${tail}`;
}

function createDefaultRepository(): PlanRepository {
  return globalThis.indexedDB
    ? new LocalPlanRepository(globalThis.indexedDB)
    : new MemoryPlanRepository();
}

export function App({ repository: suppliedRepository, deviceId: suppliedDeviceId }: AppProps) {
  const repository = useMemo(
    () => suppliedRepository ?? createDefaultRepository(),
    [suppliedRepository],
  );
  const deviceId = useMemo(() => suppliedDeviceId ?? createUuid(), [suppliedDeviceId]);
  const [state, dispatch] = useReducer(
    appReducer,
    createInitialAppState(createSamplePlan(deviceId), deviceId),
  );
  const [isOnline, setIsOnline] = useState(() => globalThis.navigator?.onLine ?? true);
  const loadStarted = useRef(false);

  const createMetadata = useCallback(
    () => ({ updatedAt: new Date().toISOString(), updatedByDevice: deviceId }),
    [deviceId],
  );

  useEffect(() => {
    if (loadStarted.current) return;
    loadStarted.current = true;
    repository
      .load(LOCAL_ACCOUNT_ID)
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
  }, [deviceId, repository]);

  useEffect(
    () =>
      repository.subscribe(LOCAL_ACCOUNT_ID, (remote) => {
        dispatch({ type: "remote-received", remote });
      }),
    [repository],
  );

  useEffect(() => {
    if (state.saveStatus !== "local-change") return;
    const snapshot = state.plan;
    const editSequence = state.editSequence;
    const timer = globalThis.setTimeout(() => {
      repository
        .save(LOCAL_ACCOUNT_ID, snapshot, snapshot.revision)
        .then((result) => {
          if (result.status === "saved") {
            dispatch({ type: "plan-saved", revision: result.revision, editSequence });
          } else {
            dispatch({ type: "save-conflicted", remote: result.remote });
          }
        })
        .catch((error: unknown) =>
          dispatch({
            type: "storage-failed",
            message: error instanceof Error ? error.message : "未知 IndexedDB 错误。",
          }),
        );
    }, 250);
    return () => globalThis.clearTimeout(timer);
  }, [repository, state.editSequence, state.plan, state.saveStatus]);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    globalThis.addEventListener("online", online);
    globalThis.addEventListener("offline", offline);
    return () => {
      globalThis.removeEventListener("online", online);
      globalThis.removeEventListener("offline", offline);
    };
  }, []);

  return (
    <Planner
      state={state}
      dispatch={dispatch}
      createId={createUuid}
      createMetadata={createMetadata}
      isOnline={isOnline}
    />
  );
}
