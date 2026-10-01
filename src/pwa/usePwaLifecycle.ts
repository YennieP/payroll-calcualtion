import { useCallback, useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";

type InstallChoice = "accepted" | "dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: InstallChoice; platform: string }>;
}

export type PwaNoticeKind =
  "install-ready" | "ios-install" | "offline-ready" | "update-ready" | "updating" | "error";

export interface PwaLifecycleState {
  notice: PwaNoticeKind | null;
  errorMessage: string | null;
  install: () => Promise<void>;
  update: () => Promise<void>;
  dismiss: () => void;
}

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

function isStandalone(): boolean {
  const navigatorWithStandalone = globalThis.navigator as Navigator & { standalone?: boolean };
  return (
    navigatorWithStandalone.standalone === true ||
    globalThis.matchMedia?.("(display-mode: standalone)").matches === true
  );
}

function isIosBrowser(): boolean {
  return /iphone|ipad|ipod/i.test(globalThis.navigator?.userAgent ?? "");
}

export function usePwaLifecycle(): PwaLifecycleState {
  const [notice, setNotice] = useState<PwaNoticeKind | null>(() =>
    !isStandalone() && isIosBrowser() ? "ios-install" : null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const updateRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    let updateTimer: number | undefined;

    const captureInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      installPromptRef.current = installEvent;
      setNotice((current) => (current === "update-ready" ? current : "install-ready"));
    };
    const markInstalled = () => {
      installPromptRef.current = null;
      setNotice(null);
    };

    globalThis.addEventListener("beforeinstallprompt", captureInstallPrompt);
    globalThis.addEventListener("appinstalled", markInstalled);

    if ("serviceWorker" in globalThis.navigator) {
      updateRef.current = registerSW({
        immediate: true,
        onNeedRefresh: () => setNotice("update-ready"),
        onOfflineReady: () =>
          setNotice((current) =>
            current === "update-ready" || current === "install-ready" || current === "ios-install"
              ? current
              : "offline-ready",
          ),
        onRegisteredSW: (_scriptUrl, registration) => {
          if (!registration) return;
          updateTimer = globalThis.setInterval(() => {
            if (globalThis.navigator.onLine) void registration.update();
          }, UPDATE_INTERVAL_MS);
        },
        onRegisterError: (error: unknown) => {
          setErrorMessage(
            error instanceof Error ? error.message : "Service Worker 注册失败，请稍后重试。",
          );
          setNotice("error");
        },
      });
    }

    return () => {
      globalThis.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      globalThis.removeEventListener("appinstalled", markInstalled);
      if (updateTimer !== undefined) globalThis.clearInterval(updateTimer);
    };
  }, []);

  const install = useCallback(async () => {
    const installPrompt = installPromptRef.current;
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    installPromptRef.current = null;
    setNotice(choice.outcome === "accepted" ? null : "install-ready");
  }, []);

  const update = useCallback(async () => {
    if (!updateRef.current) return;
    setNotice("updating");
    try {
      await updateRef.current(true);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "应用更新失败，请稍后重试。");
      setNotice("error");
    }
  }, []);

  const dismiss = useCallback(() => {
    setNotice(null);
    setErrorMessage(null);
  }, []);

  return { notice, errorMessage, install, update, dismiss };
}
