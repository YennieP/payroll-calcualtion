/* global document, indexedDB */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import process from "node:process";

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
  const port = typeof address === "object" && address ? address.port : 4175;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The preview process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForSaved(page) {
  await page.locator(".save-indicator.is-saved").waitFor({ state: "attached", timeout: 30_000 });
}

async function assertPlannerState(page, expectedRent, expectedTotal) {
  await page.getByRole("heading", { name: "已置顶" }).waitFor({ timeout: 30_000 });
  await page.locator('.planner-app[data-font-status="ready"]').waitFor({ timeout: 30_000 });
  await page
    .getByRole("spinbutton", { name: "房租每月金额" })
    .waitFor({ state: "visible", timeout: 30_000 });
  if (
    (await page.getByRole("spinbutton", { name: "房租每月金额" }).inputValue()) !== expectedRent
  ) {
    throw new Error(`Offline plan restored the wrong rent; expected ${expectedRent}.`);
  }
  await page.getByText(expectedTotal, { exact: true }).waitFor({ timeout: 30_000 });

  const shellState = await page.evaluate(() => ({
    controlled: Boolean(navigator.serviceWorker.controller),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  if (!shellState.controlled)
    throw new Error("The reopened planner is not controlled by its Service Worker.");
  if (shellState.horizontalOverflow)
    throw new Error("The offline mobile planner has horizontal overflow.");
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
const preview = spawn(
  viteBinary,
  ["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);
let previewOutput = "";
preview.stdout.on("data", (chunk) => {
  previewOutput += chunk.toString();
});
preview.stderr.on("data", (chunk) => {
  previewOutput += chunk.toString();
});

const appUrl = `http://127.0.0.1:${port}/payroll-calcualtion/`;
let browser;

try {
  await waitForServer(appUrl);
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let page = await context.newPage();

  await page.goto(appUrl, { waitUntil: "networkidle" });
  await waitForSaved(page);

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  if (!manifestHref) throw new Error("Production HTML does not link to a Web App Manifest.");
  const manifestResponse = await context.request.get(new URL(manifestHref, appUrl).href);
  if (!manifestResponse.ok()) throw new Error("The Web App Manifest cannot be fetched.");

  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  const applicationInstallabilityErrors = installabilityErrors.filter(
    ({ errorId }) => errorId !== "in-incognito",
  );
  if (applicationInstallabilityErrors.length > 0) {
    throw new Error(
      `Chrome reported PWA installability errors: ${JSON.stringify(applicationInstallabilityErrors)}`,
    );
  }

  const initialIncome = await page.locator(".income-panel > strong").textContent();
  const rentInput = page.getByRole("spinbutton", { name: "房租每月金额" });
  await rentInput.fill("4321");
  await rentInput.blur();
  await waitForSaved(page);
  await page.getByText("$12,021 / 月", { exact: true }).waitFor();
  const editedIncome = await page.locator(".income-panel > strong").textContent();
  if (!initialIncome || !editedIncome || initialIncome === editedIncome) {
    throw new Error("Editing a goal did not recalculate the California income result.");
  }

  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload({ waitUntil: "networkidle" });
    await waitForSaved(page);
  }

  await context.setOffline(true);
  await page.close();
  page = await context.newPage();
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await assertPlannerState(page, "4321", "$12,021 / 月");

  const offlineRentInput = page.getByRole("spinbutton", { name: "房租每月金额" });
  await offlineRentInput.fill("4567");
  await offlineRentInput.blur();
  await waitForSaved(page);
  await page.getByText("$12,267 / 月", { exact: true }).waitFor();
  const storedPlanCount = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const openRequest = indexedDB.open("worthwhile-plans", 1);
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const countRequest = database
            .transaction("plans", "readonly")
            .objectStore("plans")
            .count();
          countRequest.onerror = () => reject(countRequest.error);
          countRequest.onsuccess = () => {
            database.close();
            resolve(countRequest.result);
          };
        };
      }),
  );
  if (storedPlanCount !== 1) {
    throw new Error(`Expected one latest local plan document, found ${storedPlanCount}.`);
  }
  const offlineStatus = await page.locator(".save-indicator.is-saved").textContent();
  if (offlineStatus?.trim() !== "离线 · 本机可用") {
    throw new Error(`Offline status is incorrect: ${offlineStatus ?? "missing"}.`);
  }

  await page.close();
  page = await context.newPage();
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await assertPlannerState(page, "4567", "$12,267 / 月");
  await waitForSaved(page);

  console.log(
    "PWA browser check passed: Chrome reports no application installability errors, and offline edits survive two full page reopen cycles.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (previewOutput.trim()) console.error(previewOutput.trim());
  process.exitCode = 1;
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
}
