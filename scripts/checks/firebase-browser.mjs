/* global document, IDBObjectStore, indexedDB */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import process from "node:process";

import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { chromium } from "playwright-core";

const root = process.cwd();

function findChrome() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
      : undefined,
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 4176;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForSaved(page, step) {
  try {
    await page.locator(".save-indicator.is-saved").waitFor({ state: "attached", timeout: 30_000 });
  } catch (error) {
    const state = await page
      .evaluate(() => ({
        saveIndicator: document.querySelector(".save-indicator")?.textContent?.trim() ?? null,
        conflict: document.querySelector(".conflict-banner")?.textContent?.trim() ?? null,
        error: document.querySelector(".error-banner")?.textContent?.trim() ?? null,
      }))
      .catch(() => null);
    throw new Error(
      `${step} did not reach local-saved state: ${JSON.stringify(state)}; ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

async function waitForInputValue(page, label, expected) {
  const input = page.getByRole("spinbutton", { name: label });
  await input.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    ({ accessibleLabel, value }) => {
      const element = Array.from(document.querySelectorAll('input[type="number"]')).find(
        (candidate) => candidate.getAttribute("aria-label") === accessibleLabel,
      );
      return element?.value === value;
    },
    { accessibleLabel: label, value: expected },
    { timeout: 30_000 },
  );
  return input;
}

async function openAccount(page) {
  await page.locator(".account-control > .compact-control").click();
  await page.getByRole("dialog", { name: "账户与同步" }).waitFor({ timeout: 30_000 });
}

async function register(page, email, password) {
  await page.locator(".account-control > .compact-control").click();
  const dialog = page.getByRole("dialog", { name: "账户与同步" });
  await dialog.getByRole("tab", { name: "注册" }).click();
  await dialog.getByLabel("邮箱").fill(email);
  await dialog.getByLabel("密码").fill(password);
  await dialog.getByRole("button", { name: "创建账户" }).click();
}

async function signIn(page, email, password) {
  await page.locator(".account-control > .compact-control").click();
  const dialog = page.getByRole("dialog", { name: "账户与同步" });
  await dialog.getByLabel("邮箱").fill(email);
  await dialog.getByLabel("密码").fill(password);
  await dialog.getByRole("button", { name: "登录并同步" }).click();
}

async function readAndRemoveAccountCache(page) {
  return page.evaluate(
    ({ databaseName, databaseVersion, storeName, anonymousKey }) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, databaseVersion);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(storeName, "readwrite");
          const store = transaction.objectStore(storeName);
          const read = store.getAll();
          read.onerror = () => reject(read.error ?? new Error("IndexedDB read failed."));
          read.onsuccess = () => {
            const account = read.result.find((entry) => entry.accountId !== anonymousKey);
            if (!account?.accountId || !account.plan) {
              reject(new Error("Expected an authenticated plan cache in IndexedDB."));
              return;
            }
            store.delete(account.accountId);
            transaction.oncomplete = () => {
              database.close();
              resolve({ accountId: account.accountId, plan: account.plan });
            };
          };
          transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB failed."));
        };
      }),
    {
      databaseName: "worthwhile-plans",
      databaseVersion: 2,
      storeName: "plans",
      anonymousKey: "anonymous-local",
    },
  );
}

const executablePath = findChrome();
if (!executablePath) {
  console.error(
    "A local Chrome/Chromium executable is required. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.",
  );
  process.exit(1);
}

const port = await reservePort();
const viteBinary = join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vite.cmd" : "vite",
);
const server = spawn(viteBinary, ["--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: root,
  env: {
    ...process.env,
    VITE_FIREBASE_API_KEY: "fake-api-key",
    VITE_FIREBASE_AUTH_DOMAIN: "demo-worthwhile-local.firebaseapp.com",
    VITE_FIREBASE_PROJECT_ID: "demo-worthwhile-local",
    VITE_FIREBASE_APP_ID: "1:123456789:web:123456789",
    VITE_FIREBASE_USE_EMULATORS: "true",
    VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
    VITE_FIRESTORE_EMULATOR_HOST: "127.0.0.1",
    VITE_FIRESTORE_EMULATOR_PORT: "8080",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

const appUrl = `http://127.0.0.1:${port}/payroll-calcualtion/`;
const email = `phase6-browser-${Date.now()}@example.test`;
const corruptEmail = `phase7-corrupt-browser-${Date.now()}@example.test`;
const password = "phase6-browser-password";
let browser;
let rulesEnvironment;

try {
  await waitForServer(appUrl);
  browser = await chromium.launch({ executablePath, headless: true });
  rulesEnvironment = await initializeTestEnvironment({
    projectId: "demo-worthwhile-local",
    firestore: { host: "127.0.0.1", port: 8080 },
  });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const desktopPage = await desktop.newPage();
  const phonePage = await phone.newPage();

  await desktopPage.goto(appUrl, { waitUntil: "networkidle" });
  await waitForSaved(desktopPage, "desktop anonymous startup");
  await register(desktopPage, email, password);
  await desktopPage
    .getByRole("heading", { name: "导入这台设备的计划？" })
    .waitFor({ timeout: 30_000 });
  await desktopPage.getByRole("button", { name: "导入本机计划" }).click();
  await desktopPage.getByRole("heading", { name: "已置顶" }).waitFor({ timeout: 30_000 });

  const desktopRent = await waitForInputValue(desktopPage, "房租每月金额", "3200");
  await desktopRent.fill("4100");
  await desktopRent.blur();
  await waitForSaved(desktopPage, "desktop first edit");

  await phonePage.goto(appUrl, { waitUntil: "networkidle" });
  await waitForSaved(phonePage, "phone anonymous startup");
  await signIn(phonePage, email, password);
  await waitForInputValue(phonePage, "房租每月金额", "4100");

  await phone.setOffline(true);
  const offlineRent = phonePage.getByRole("spinbutton", { name: "房租每月金额" });
  await offlineRent.fill("4200");
  await offlineRent.blur();
  await phonePage.waitForFunction(
    () =>
      document.querySelector(".save-indicator.is-saved")?.textContent?.trim() === "离线 · 本机可用",
    undefined,
    { timeout: 30_000 },
  );
  await phone.setOffline(false);
  await waitForInputValue(desktopPage, "房租每月金额", "4200");

  const currentDesktopRent = desktopPage.getByRole("spinbutton", { name: "房租每月金额" });
  await currentDesktopRent.fill("4300");
  await currentDesktopRent.blur();
  await waitForSaved(desktopPage, "desktop post-offline edit");
  await waitForInputValue(phonePage, "房租每月金额", "4300");

  await openAccount(phonePage);
  await phonePage.getByText("云端已同步", { exact: true }).waitFor({ timeout: 30_000 });
  await phonePage.getByRole("button", { name: "关闭账户面板" }).click();

  await openAccount(desktopPage);
  await desktopPage.getByRole("button", { name: "删除整份计划" }).click();
  await desktopPage.getByRole("button", { name: "确认删除" }).click();
  await waitForInputValue(phonePage, "房租每月金额", "3200");
  await desktopPage.getByRole("button", { name: "关闭账户面板" }).click();

  const recreatedDesktopRent = desktopPage.getByRole("spinbutton", { name: "房租每月金额" });
  await recreatedDesktopRent.fill("4400");
  await recreatedDesktopRent.blur();
  await waitForSaved(desktopPage, "desktop recreation after deletion");
  await waitForInputValue(phonePage, "房租每月金额", "4400");

  const overflow = await Promise.all(
    [desktopPage, phonePage].map((page) =>
      page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ),
  );
  if (overflow.some(Boolean))
    throw new Error("Synced desktop or phone context has horizontal overflow.");

  const corruptContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let corruptPage = await corruptContext.newPage();
  await corruptPage.goto(appUrl, { waitUntil: "domcontentloaded" });
  await waitForSaved(corruptPage, "corrupt-data account anonymous startup");
  await register(corruptPage, corruptEmail, password);
  await corruptPage
    .getByRole("heading", { name: "导入这台设备的计划？" })
    .waitFor({ timeout: 30_000 });
  await corruptPage.getByRole("button", { name: "导入本机计划" }).click();
  await corruptPage.getByRole("heading", { name: "已置顶" }).waitFor({ timeout: 30_000 });
  await openAccount(corruptPage);
  await corruptPage.getByText("云端已同步", { exact: true }).waitFor({ timeout: 30_000 });
  await corruptPage.getByRole("button", { name: "关闭账户面板" }).click();

  const accountCache = await readAndRemoveAccountCache(corruptPage);
  const invalidPlan = structuredClone(accountCache.plan);
  invalidPlan.categories[0].goals[0].monthlyAmountCents = 50_000_001;
  await rulesEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "plans", accountCache.accountId), invalidPlan);
  });
  await corruptPage.close();

  corruptPage = await corruptContext.newPage();
  await corruptPage.goto(appUrl, { waitUntil: "domcontentloaded" });
  await corruptPage.getByRole("heading", { name: "云端计划需要处理" }).waitFor({ timeout: 30_000 });
  if (
    await corruptPage
      .getByRole("heading", { name: "已置顶" })
      .isVisible()
      .catch(() => false)
  ) {
    throw new Error("A deeply corrupt cloud document rendered as an editable plan.");
  }
  const [corruptDownload] = await Promise.all([
    corruptPage.waitForEvent("download"),
    corruptPage.getByRole("button", { name: "导出云端原始计划 JSON" }).click(),
  ]);
  const corruptDownloadPath = await corruptDownload.path();
  const downloadedCloudPlan = corruptDownloadPath
    ? JSON.parse(await readFile(corruptDownloadPath, "utf8"))
    : null;
  if (downloadedCloudPlan?.categories?.[0]?.goals?.[0]?.monthlyAmountCents !== 50_000_001) {
    throw new Error("The cloud recovery download did not preserve the corrupt source document.");
  }
  await rulesEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "plans", accountCache.accountId), accountCache.plan);
  });
  await corruptPage.getByRole("button", { name: "重新读取云端计划" }).click();
  await waitForInputValue(corruptPage, "房租每月金额", "3200");

  await corruptPage.close();
  await corruptContext.addInitScript((accountId) => {
    const originalDelete = IDBObjectStore.prototype.delete;
    let failAccountCleanupOnce = true;
    IDBObjectStore.prototype.delete = function deleteWithInjectedFailure(key) {
      if (failAccountCleanupOnce && this.name === "plans" && key === accountId) {
        failAccountCleanupOnce = false;
        IDBObjectStore.prototype.delete = originalDelete;
        throw new DOMException("Injected account cache cleanup failure.", "AbortError");
      }
      return originalDelete.call(this, key);
    };
  }, accountCache.accountId);
  corruptPage = await corruptContext.newPage();
  await corruptPage.goto(appUrl, { waitUntil: "domcontentloaded" });
  await corruptPage.getByRole("heading", { name: "已置顶" }).waitFor({ timeout: 30_000 });
  await openAccount(corruptPage);
  await corruptPage.getByRole("button", { name: "退出并清除此设备缓存" }).click();
  await corruptPage.getByRole("heading", { name: "设备缓存尚未清理" }).waitFor({ timeout: 30_000 });
  if (
    await corruptPage
      .getByRole("heading", { name: "已置顶" })
      .isVisible()
      .catch(() => false)
  ) {
    throw new Error("The planner remained editable after account-cache cleanup failed.");
  }
  const cleanupGateOverflow = await corruptPage.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  if (cleanupGateOverflow)
    throw new Error("The mobile cache-cleanup gate has horizontal overflow.");
  await corruptPage.keyboard.press("Tab");
  const focusedCleanupAction = await corruptPage.evaluate(
    () => document.activeElement?.textContent?.trim() ?? "",
  );
  if (!focusedCleanupAction.includes("重试清理")) {
    throw new Error(`Cache-cleanup gate keyboard focus is incorrect: ${focusedCleanupAction}.`);
  }
  await corruptPage.getByRole("button", { name: "重试清理设备缓存" }).click();
  await corruptPage.getByRole("heading", { name: "已置顶" }).waitFor({ timeout: 30_000 });
  await corruptPage.getByRole("button", { name: "跨设备同步" }).waitFor({ timeout: 30_000 });
  await corruptContext.close();

  await desktop.close();
  await phone.close();
  console.log(
    "Firebase browser check passed: independent desktop and phone contexts synchronized edits, offline recovery, deletion, monotonic recreation, fail-closed cloud-data recovery, and retryable account-cache cleanup.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (serverOutput.trim()) console.error(serverOutput.trim());
  process.exitCode = 1;
} finally {
  await rulesEnvironment?.cleanup();
  await browser?.close();
  server.kill("SIGTERM");
}
