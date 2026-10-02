/* global caches, document, getComputedStyle */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import process from "node:process";

import { chromium } from "playwright-core";

const root = process.cwd();
const expectedCachedFontCount = readdirSync(join(root, "public", "fonts"), {
  recursive: true,
}).filter((file) => String(file).endsWith(".woff2")).length;
const fontAssetVersion = JSON.parse(
  readFileSync(join(root, "public", "fonts", "asset-manifest.json"), "utf8"),
).version;
const expectedFontCacheName = `worthwhile-fonts-${fontAssetVersion}`;

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
  const port = typeof address === "object" && address ? address.port : 4174;
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
  {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let previewOutput = "";
preview.stdout.on("data", (chunk) => {
  previewOutput += chunk.toString();
});
preview.stderr.on("data", (chunk) => {
  previewOutput += chunk.toString();
});
let previewStopped = false;
async function stopPreview() {
  if (previewStopped) return;
  previewStopped = true;
  if (preview.exitCode !== null || preview.signalCode !== null) return;
  preview.kill("SIGTERM");
  await new Promise((resolve) => preview.once("exit", resolve));
}

const fixtureUrl = `http://127.0.0.1:${port}/payroll-calcualtion/?font-audit=1`;
let browser;

try {
  await waitForServer(fixtureUrl);
  browser = await chromium.launch({ executablePath, headless: true });

  const retryContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const retryPage = await retryContext.newPage();
  let failedVersionedFont = false;
  await retryPage.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      !failedVersionedFont &&
      url.searchParams.get("font-version") === fontAssetVersion &&
      url.pathname.endsWith(".woff2")
    ) {
      failedVersionedFont = true;
      await route.fulfill({ status: 503, body: "injected font warmup failure" });
      return;
    }
    await route.continue();
  });
  await retryPage.goto(`http://127.0.0.1:${port}/payroll-calcualtion/`, {
    waitUntil: "networkidle",
  });
  await retryPage
    .locator('.planner-app[data-font-library-status="error"]')
    .waitFor({ timeout: 60_000 });
  if (!failedVersionedFont) throw new Error("The font warmup failure was not injected.");
  await retryContext.setOffline(true);
  await retryPage.getByRole("button", { name: "重试保存字体" }).click();
  await retryPage.waitForTimeout(500);
  await retryPage
    .locator('.planner-app[data-font-library-status="error"]')
    .waitFor({ timeout: 10_000 });
  await retryContext.setOffline(false);
  await retryPage.getByRole("button", { name: "重试保存字体" }).click();
  await retryPage
    .locator('.planner-app[data-font-library-status="ready"]')
    .waitFor({ timeout: 180_000 });
  await retryContext.close();

  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const failedRequests = [];
  page.on("requestfailed", (request) => failedRequests.push(request.url()));

  await page.goto(fixtureUrl, { waitUntil: "networkidle" });
  try {
    await page.locator('[data-font-audit="passed"]').waitFor({ timeout: 60_000 });
  } catch {
    const auditStatus = await page.locator("[data-font-audit]").getAttribute("data-font-audit");
    const failures = await page.locator(".font-audit-failures li").allTextContents();
    throw new Error(
      `Font audit did not pass (status: ${auditStatus ?? "missing"}).\n${failures.join("\n")}`,
    );
  }

  const themeCount = await page.locator("[data-audit-theme]").count();
  if (themeCount !== 7) throw new Error(`Expected 7 theme fixtures, found ${themeCount}.`);

  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  if (overflow.documentWidth > overflow.viewportWidth) {
    throw new Error(
      `Desktop fixture overflows by ${overflow.documentWidth - overflow.viewportWidth}px.`,
    );
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileOverflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  if (mobileOverflow.documentWidth > mobileOverflow.viewportWidth) {
    throw new Error(
      `Mobile fixture overflows by ${mobileOverflow.documentWidth - mobileOverflow.viewportWidth}px.`,
    );
  }

  await page.evaluate(() =>
    Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Service Worker readiness timed out.")), 30_000),
      ),
    ]),
  );
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload({ waitUntil: "networkidle" });
  }

  await page.waitForFunction(
    async ({ cacheName, expectedCount, version }) => {
      const cache = await caches.open(cacheName);
      const entries = await cache.keys();
      return (
        entries.filter((request) => request.url.includes(".woff2")).length === expectedCount &&
        entries.some((request) => request.url.endsWith(`/fonts/.cache-complete-${version}`))
      );
    },
    {
      cacheName: expectedFontCacheName,
      expectedCount: expectedCachedFontCount,
      version: fontAssetVersion,
    },
    { timeout: 180_000 },
  );

  const cachedFontCount = await page.evaluate(async (cacheName) => {
    const entries = await (await caches.open(cacheName)).keys();
    return entries.filter((request) => request.url.includes(".woff2")).length;
  }, expectedFontCacheName);
  if (cachedFontCount !== expectedCachedFontCount) {
    throw new Error(
      `Expected ${expectedCachedFontCount} cached WOFF2 files, found ${cachedFontCount}.`,
    );
  }

  await page.evaluate(async () => {
    await caches.open("worthwhile-fonts-obsolete-browser-check");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('[data-font-audit="passed"]').waitFor({ timeout: 60_000 });
  await page.waitForFunction(async () => {
    const cacheNames = await caches.keys();
    return !cacheNames.includes("worthwhile-fonts-obsolete-browser-check");
  });

  mkdirSync(join(root, "test-results"), { recursive: true });
  await page.screenshot({
    path: join(root, "test-results", "font-audit-mobile.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`http://127.0.0.1:${port}/payroll-calcualtion/`, {
    waitUntil: "networkidle",
  });
  await page.locator('.planner-app[data-font-status="ready"]').waitFor({ timeout: 30_000 });
  const rentInput = page.getByRole("spinbutton", { name: "房租每月金额" });
  const originalRent = await rentInput.inputValue();
  const themes = [
    { id: "rouge", name: "绯红绒", body: "Bodoni Moda", number: "Bodoni Moda" },
    {
      id: "midnight",
      name: "蓝午夜",
      body: "Cormorant Garamond",
      number: "DM Serif Display",
    },
    {
      id: "violet-amber",
      name: "紫午夜 · 琥珀",
      body: "Space Grotesk",
      number: "Space Grotesk",
    },
    {
      id: "violet-crimson",
      name: "紫午夜 · 绯红",
      body: "Cinzel",
      number: "Cinzel",
    },
    {
      id: "violet-blue",
      name: "紫午夜 · 电光蓝",
      body: "Space Grotesk",
      number: "Space Grotesk",
    },
    {
      id: "gold-opera",
      name: "金歌剧",
      body: "Cormorant Garamond",
      number: "Cormorant Garamond",
    },
    {
      id: "scarlet-opera",
      name: "绯歌剧",
      body: "Libre Caslon Display",
      number: "Libre Caslon Display",
    },
  ];
  const themeSurfaceSignatures = new Set();

  for (const theme of themes) {
    await page.getByRole("button", { name: /主题/ }).click();
    await page
      .getByRole("dialog", { name: "选择主题" })
      .getByRole("button", { name: new RegExp(theme.name) })
      .click();
    await page
      .locator(`.planner-app[data-theme="${theme.id}"][data-font-status="ready"]`)
      .waitFor({ timeout: 30_000 });
    if ((await rentInput.inputValue()) !== originalRent) {
      throw new Error(`Theme ${theme.id} changed planner data.`);
    }
    const themeState = await page.evaluate(() => {
      const planner = document.querySelector(".planner-app");
      const stage = document.querySelector(".planner-stage");
      const nav = document.querySelector(".planner-nav");
      const main = document.querySelector(".planner-main");
      const income = document.querySelector(".income-panel");
      const incomeNumber = document.querySelector(".income-panel > strong");
      return {
        theme: stage?.getAttribute("data-theme"),
        bodyFont: planner ? getComputedStyle(planner).fontFamily : "",
        numberFont: incomeNumber ? getComputedStyle(incomeNumber).fontFamily : "",
        signature: [nav, main, income]
          .map((element) => (element ? getComputedStyle(element).backgroundImage : ""))
          .join("|"),
      };
    });
    if (themeState.theme !== theme.id) {
      throw new Error(`Theme ${theme.id} did not update the full-width application root.`);
    }
    if (!themeState.bodyFont.replaceAll('"', "").startsWith(theme.body)) {
      throw new Error(
        `Theme ${theme.id} body font is ${themeState.bodyFont}; expected ${theme.body}.`,
      );
    }
    if (!themeState.numberFont.replaceAll('"', "").startsWith(theme.number)) {
      throw new Error(
        `Theme ${theme.id} number font is ${themeState.numberFont}; expected ${theme.number}.`,
      );
    }
    if (!themeState.signature.includes("radial-gradient")) {
      throw new Error(`Theme ${theme.id} did not render textured three-column surfaces.`);
    }
    themeSurfaceSignatures.add(themeState.signature);
  }

  if (themeSurfaceSignatures.size !== themes.length) {
    throw new Error(
      `Expected 7 distinct three-column theme treatments, found ${themeSurfaceSignatures.size}.`,
    );
  }

  await page.getByRole("button", { name: /主题/ }).click();
  await page
    .getByRole("dialog", { name: "选择主题" })
    .getByRole("button", { name: /蓝午夜/ })
    .click();
  await page
    .locator('.planner-app[data-theme="midnight"][data-font-status="ready"]')
    .waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: /主题/ }).click();

  const desktopTypography = await page.evaluate(() => {
    const read = (selector, property) => {
      const element = document.querySelector(selector);
      return element ? getComputedStyle(element)[property] : null;
    };
    return {
      eyebrow: read(".page-eyebrow", "fontSize"),
      navigationAmount: read(".planner-nav em", "fontSize"),
      navigationFooter: read(".planner-nav footer small", "fontSize"),
      themeDescription: read(".theme-grid small", "fontSize"),
      themePanelDescription: read(".theme-panel header small", "fontSize"),
      summaryLabel: read(".summary-stats span", "fontSize"),
      summaryValue: read(".summary-stats strong", "fontSize"),
      goalNameWeight: read(".goal-name-input", "fontWeight"),
      sourceButton: read(".source-button", "fontSize"),
      incomeValue: read(".income-panel > strong", "fontSize"),
      incomeNumberFamily: read(".income-panel > strong", "fontFamily"),
    };
  });
  const minimumDesktopTypography = {
    eyebrow: 13,
    navigationAmount: 13,
    navigationFooter: 12,
    themeDescription: 10,
    themePanelDescription: 11,
    summaryLabel: 12,
    summaryValue: 35,
    sourceButton: 12,
    incomeValue: 48,
  };
  for (const [key, minimum] of Object.entries(minimumDesktopTypography)) {
    const actual = Number.parseFloat(desktopTypography[key] ?? "0");
    if (actual < minimum) {
      throw new Error(`Typography for ${key} is ${actual}px; expected at least ${minimum}px.`);
    }
  }
  if (desktopTypography.goalNameWeight !== "400") {
    throw new Error(`Goal name weight is ${desktopTypography.goalNameWeight}; expected 400.`);
  }
  if (!desktopTypography.incomeNumberFamily?.replaceAll('"', "").startsWith("DM Serif Display")) {
    throw new Error(
      `Blue Midnight number face is ${desktopTypography.incomeNumberFamily}; expected DM Serif Display.`,
    );
  }
  await page.getByRole("button", { name: "关闭主题选择" }).click();

  const readPlannerGeometry = () =>
    page.evaluate(() => {
      const stage = document.querySelector(".planner-stage").getBoundingClientRect();
      const planner = document.querySelector(".planner-app").getBoundingClientRect();
      const nav = document.querySelector(".planner-nav").getBoundingClientRect();
      const main = document.querySelector(".planner-main").getBoundingClientRect();
      const income = document.querySelector(".income-panel").getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        stageWidth: stage.width,
        plannerWidth: planner.width,
        plannerLeft: planner.left,
        plannerRight: planner.right,
        navWidth: nav.width,
        mainWidth: main.width,
        incomeWidth: income.width,
        navTop: nav.top,
        mainTop: main.top,
        incomeTop: income.top,
      };
    });

  const assertDesktopGeometry = async (width, expectedColumns) => {
    await page.setViewportSize({ width, height: 1100 });
    const geometry = await readPlannerGeometry();
    const actualColumns = [geometry.navWidth, geometry.mainWidth, geometry.incomeWidth];
    const hasIncorrectWidth =
      Math.abs(geometry.stageWidth - width) > 0.5 ||
      Math.abs(geometry.plannerWidth - width) > 0.5 ||
      Math.abs(geometry.plannerLeft) > 0.5 ||
      Math.abs(geometry.plannerRight - width) > 0.5;
    const hasIncorrectColumns = actualColumns.some(
      (column, index) => Math.abs(column - expectedColumns[index]) > 0.75,
    );
    if (
      geometry.documentWidth > geometry.viewportWidth ||
      hasIncorrectWidth ||
      hasIncorrectColumns
    ) {
      throw new Error(`Desktop ${width}px geometry is incorrect: ${JSON.stringify(geometry)}.`);
    }
  };

  await assertDesktopGeometry(1440, [259.2, 864, 316.8]);
  await page.screenshot({
    path: join(root, "test-results", "planner-desktop-midnight.png"),
    fullPage: false,
  });
  await assertDesktopGeometry(1280, [230.4, 759.6, 290]);
  await assertDesktopGeometry(2000, [360, 1200, 440]);

  await page.setViewportSize({ width: 900, height: 1000 });
  const tabletState = await readPlannerGeometry();
  if (tabletState.documentWidth > tabletState.viewportWidth) {
    throw new Error("The tablet planner has horizontal overflow after typography restoration.");
  }
  if (
    [tabletState.navWidth, tabletState.mainWidth, tabletState.incomeWidth].some(
      (width) => Math.abs(width - 900) > 0.75,
    ) ||
    !(tabletState.navTop < tabletState.mainTop && tabletState.mainTop < tabletState.incomeTop)
  ) {
    throw new Error(
      `The 900px planner did not stack all three panels: ${JSON.stringify(tabletState)}.`,
    );
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const plannerMobileOverflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    incomeSize: getComputedStyle(document.querySelector(".income-panel > strong")).fontSize,
    plannerCount: document.querySelectorAll(".planner-app").length,
    topbarCount: document.querySelectorAll(".topbar").length,
    topbarPosition: getComputedStyle(document.querySelector(".topbar")).position,
  }));
  if (plannerMobileOverflow.documentWidth > plannerMobileOverflow.viewportWidth) {
    throw new Error("The mobile planner has horizontal overflow after theme switching.");
  }
  if (Number.parseFloat(plannerMobileOverflow.incomeSize) < 48) {
    throw new Error(
      `Mobile income typography is ${plannerMobileOverflow.incomeSize}; expected at least 48px.`,
    );
  }
  if (
    plannerMobileOverflow.plannerCount !== 1 ||
    plannerMobileOverflow.topbarCount !== 1 ||
    plannerMobileOverflow.topbarPosition !== "relative"
  ) {
    throw new Error(
      `Mobile shell duplicated or detached: ${JSON.stringify(plannerMobileOverflow)}.`,
    );
  }
  await page.screenshot({
    path: join(root, "test-results", "planner-mobile-midnight.png"),
    fullPage: false,
  });

  await page.goto(fixtureUrl, { waitUntil: "networkidle" });
  await page.locator('[data-font-audit="passed"]').waitFor({ timeout: 60_000 });
  if (failedRequests.length > 0) {
    throw new Error(`Online font fixture had failed requests:\n${failedRequests.join("\n")}`);
  }
  failedRequests.length = 0;
  await stopPreview();
  await page.reload({ waitUntil: "domcontentloaded" });
  try {
    await page.locator('[data-font-audit="passed"]').waitFor({ timeout: 60_000 });
  } catch {
    const auditStatus = await page.locator("[data-font-audit]").getAttribute("data-font-audit");
    const failures = await page.locator(".font-audit-failures li").allTextContents();
    const diagnostics = await page.evaluate(async () => {
      const shorthand = 'normal 400 32px "Bodoni Moda"';
      let loadResult;
      try {
        const faces = await document.fonts.load(shorthand, "Worthwhile California 0123456789");
        loadResult = `resolved:${faces.length}`;
      } catch (error) {
        loadResult = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      }
      return {
        fontLinks: document.querySelectorAll("link[data-font-family]").length,
        fontSetSize: document.fonts.size,
        bodoniFaces: [...document.fonts]
          .filter((face) => face.family === "Bodoni Moda")
          .map((face) => ({
            status: face.status,
            style: face.style,
            weight: face.weight,
            unicodeRange: face.unicodeRange,
          })),
        check: document.fonts.check(shorthand, "Worthwhile California 0123456789"),
        loadResult,
      };
    });
    throw new Error(
      `Font audit did not survive a serverless reopen (status: ${auditStatus ?? "missing"}).\n${JSON.stringify(diagnostics)}\n${failures.join("\n")}`,
    );
  }

  const unexpectedOfflineFailures = failedRequests.filter(
    (url) => !/\/fonts\/.*\.woff2$/.test(new URL(url).pathname),
  );
  if (unexpectedOfflineFailures.length > 0) {
    throw new Error(
      `Serverless font fixture had unexpected failed requests:\n${unexpectedOfflineFailures.join("\n")}`,
    );
  }

  console.log(
    `Browser font audit passed for 7 themes at desktop/mobile widths; planner data stayed stable and ${cachedFontCount} WOFF2 files are available offline.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (previewOutput.trim()) console.error(previewOutput.trim());
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stopPreview();
}
