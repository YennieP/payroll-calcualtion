/* global caches, document, DOMPoint, getComputedStyle, HTMLImageElement */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
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
  const themeLogoSignatures = new Set();

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
      const logo = document.querySelector(".logo-mark");
      return {
        theme: stage?.getAttribute("data-theme"),
        bodyFont: planner ? getComputedStyle(planner).fontFamily : "",
        numberFont: incomeNumber ? getComputedStyle(incomeNumber).fontFamily : "",
        logoWidth: logo ? getComputedStyle(logo).width : "",
        logoHeight: logo ? getComputedStyle(logo).height : "",
        logoFragment: logo instanceof HTMLImageElement ? new URL(logo.src).hash : "",
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
    if (themeState.logoWidth !== "34px" || themeState.logoHeight !== "34px") {
      throw new Error(
        `Theme ${theme.id} logo measured ${themeState.logoWidth} x ${themeState.logoHeight}; expected 34px x 34px.`,
      );
    }
    if (themeState.logoFragment !== `#${theme.id}`) {
      throw new Error(
        `Theme ${theme.id} loaded logo fragment ${themeState.logoFragment || "none"}.`,
      );
    }
    const logoScreenshot = await page.locator(".logo-mark").screenshot();
    const logoSignature = createHash("sha256").update(logoScreenshot).digest("hex");
    themeSurfaceSignatures.add(themeState.signature);
    themeLogoSignatures.add(logoSignature);
  }

  if (themeSurfaceSignatures.size !== themes.length) {
    throw new Error(
      `Expected 7 distinct three-column theme treatments, found ${themeSurfaceSignatures.size}.`,
    );
  }
  if (themeLogoSignatures.size !== themes.length) {
    throw new Error(`Expected 7 distinct logo palettes, found ${themeLogoSignatures.size}.`);
  }

  const iconPage = await context.newPage();
  await iconPage.goto(`http://127.0.0.1:${port}/payroll-calcualtion/icons/app-icon.svg#rouge`, {
    waitUntil: "networkidle",
  });
  await iconPage.locator("#logo-letter").waitFor({ timeout: 30_000 });
  const iconGeometry = await iconPage.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector);
      if (!element || typeof element.getBBox !== "function") return null;
      const bounds = element.getBBox();
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        centerX: bounds.x + bounds.width / 2,
        centerY: bounds.y + bounds.height / 2,
      };
    };
    const renderedBox = (selector) => {
      const element = document.querySelector(selector);
      const root = document.documentElement;
      if (
        !element ||
        typeof element.getBBox !== "function" ||
        typeof element.getCTM !== "function" ||
        typeof root.getCTM !== "function"
      ) {
        return null;
      }
      const bounds = element.getBBox();
      const elementMatrix = element.getCTM();
      const rootMatrix = root.getCTM();
      if (!elementMatrix || !rootMatrix) return null;
      const matrix = rootMatrix.inverse().multiply(elementMatrix);
      const corners = [
        new DOMPoint(bounds.x, bounds.y),
        new DOMPoint(bounds.x + bounds.width, bounds.y),
        new DOMPoint(bounds.x, bounds.y + bounds.height),
        new DOMPoint(bounds.x + bounds.width, bounds.y + bounds.height),
      ].map((point) => point.matrixTransform(matrix));
      const xs = corners.map((point) => point.x);
      const ys = corners.map((point) => point.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const width = Math.max(...xs) - x;
      const height = Math.max(...ys) - y;
      return { x, y, width, height, centerX: x + width / 2, centerY: y + height / 2 };
    };
    const pointRelativeToEmblem = (selector, x, y) => {
      const element = document.querySelector(selector);
      const emblem = document.querySelector("#logo-emblem");
      if (
        !element ||
        !emblem ||
        typeof element.getCTM !== "function" ||
        typeof emblem.getCTM !== "function"
      ) {
        return null;
      }
      const elementMatrix = element.getCTM();
      const emblemMatrix = emblem.getCTM();
      if (!elementMatrix || !emblemMatrix) return null;
      const matrix = emblemMatrix.inverse().multiply(elementMatrix);
      return new DOMPoint(x, y).matrixTransform(matrix);
    };
    const samplePath = (selector, samples) => {
      const path = document.querySelector(selector);
      const emblem = document.querySelector("#logo-emblem");
      if (
        !path ||
        !emblem ||
        typeof path.getTotalLength !== "function" ||
        typeof path.getPointAtLength !== "function" ||
        typeof path.getCTM !== "function" ||
        typeof emblem.getCTM !== "function"
      ) {
        return [];
      }
      const pathMatrix = path.getCTM();
      const emblemMatrix = emblem.getCTM();
      if (!pathMatrix || !emblemMatrix) return [];
      const matrix = emblemMatrix.inverse().multiply(pathMatrix);
      const length = path.getTotalLength();
      return Array.from({ length: samples + 1 }, (_, index) => {
        const point = path.getPointAtLength((length * index) / samples);
        return new DOMPoint(point.x, point.y).matrixTransform(matrix);
      });
    };
    const boundsFromPoints = (points) => {
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const width = Math.max(...xs) - x;
      const height = Math.max(...ys) - y;
      return { x, y, width, height, centerX: x + width / 2, centerY: y + height / 2 };
    };
    const letterPoints = [
      ...samplePath("#logo-letter", 720),
      ...samplePath(".logo-letter-depth", 720),
    ];
    const windowPoints = samplePath("#logo-window-ring", 720);
    const stagePoints = samplePath("#logo-stage-base", 720);
    const windowCenter =
      pointRelativeToEmblem("#logo-window-ring", 256, 246) ?? new DOMPoint(256, 228);
    const letterVisualAnchor =
      pointRelativeToEmblem("#logo-letter", 529, -716) ?? new DOMPoint(Number.NaN, Number.NaN);
    const maxLetterRadius = letterPoints.reduce(
      (maximum, point) =>
        Math.max(maximum, Math.hypot(point.x - windowCenter.x, point.y - windowCenter.y)),
      0,
    );
    const attribute = (selector, name) => document.querySelector(selector)?.getAttribute(name);
    return {
      emblem: renderedBox("#logo-emblem"),
      windowComposition: renderedBox("#logo-window-composition"),
      windowRendered: renderedBox("#logo-window-ring"),
      stageRendered: renderedBox("#logo-stage-base"),
      beamRendered: renderedBox("#logo-light-beam"),
      outerArchPresent: Boolean(document.querySelector("#logo-outer-arch")),
      innerArchPresent: Boolean(document.querySelector("#logo-inner-arch")),
      crownGemPresent: Boolean(document.querySelector("#logo-gem-outline")),
      window: boundsFromPoints(windowPoints),
      letter: boundsFromPoints(letterPoints),
      stage: boundsFromPoints(stagePoints),
      border: box("#logo-border"),
      maxLetterRadius,
      emblemTransform: attribute("#logo-emblem", "transform"),
      windowCompositionTransform: attribute("#logo-window-composition", "transform"),
      lightBeamPath: attribute("#logo-light-beam", "d"),
      stageGeometry: ["cx", "cy", "rx", "ry"].map((name) => attribute("#logo-stage-base", name)),
      windowCenter: { x: windowCenter.x, y: windowCenter.y },
      letterVisualAnchor: { x: letterVisualAnchor.x, y: letterVisualAnchor.y },
      windowGradient: attribute("#window", "gradientTransform"),
      metalAxis: [attribute("#metal", "x1"), attribute("#metal", "x2")],
      windowStrokeWidth: Number(attribute("#logo-window-ring", "stroke-width")) * 1.36,
      letterAssemblyTransform: attribute("#logo-letter-assembly", "transform"),
      letterVisualAnchorSource: attribute("#logo-letter-assembly", "data-visual-anchor-source"),
      letterFaceTransform: attribute("#logo-letter", "transform"),
      letterDepthTransform: attribute(".logo-letter-depth", "transform"),
      letterRimTransform: attribute(".logo-letter-rim", "transform"),
      orbitGeometry: [...document.querySelectorAll("#logo-window-orbits ellipse")].map((orbit) =>
        ["cx", "cy", "rx", "ry", "transform"]
          .map((name) => orbit.getAttribute(name) ?? "")
          .join("|"),
      ),
      starGeometry: [...document.querySelectorAll("#logo-window-stars circle")].map((star) =>
        ["cx", "cy", "r"].map((name) => star.getAttribute(name) ?? "").join("|"),
      ),
      windowGuideRadius: attribute("#logo-window-guide", "r"),
      windowHubRadius: attribute("#logo-window-hub", "r"),
      windowCoreRadius: attribute("#logo-window-core", "r"),
      radialRaysPresent: Boolean(document.querySelector(".logo-window-rays")),
    };
  });
  const centeredX = [iconGeometry.window, iconGeometry.stage, iconGeometry.border];
  if (centeredX.some((bounds) => !bounds || Math.abs(bounds.centerX - 256) > 0.11)) {
    throw new Error(
      `Logo components are not horizontally centered: ${JSON.stringify(iconGeometry)}`,
    );
  }
  if (
    !iconGeometry.letter ||
    !iconGeometry.window ||
    Math.abs(iconGeometry.letter.centerY - iconGeometry.window.centerY) > 0.11 ||
    Math.abs(iconGeometry.letterVisualAnchor.x - iconGeometry.window.centerX) > 0.11 ||
    iconGeometry.letterAssemblyTransform !== "translate(12.7921909 0)" ||
    iconGeometry.letterVisualAnchorSource !== "529 -716" ||
    iconGeometry.letterFaceTransform !== "matrix(.1598579 0 0 .1598579 158.64298 302.22558)" ||
    iconGeometry.letterDepthTransform !== "matrix(.1598579 0 0 .1598579 166.64298 312.22558)" ||
    iconGeometry.letterRimTransform !== "matrix(.1598579 0 0 .1598579 158.64298 302.22558)"
  ) {
    throw new Error(
      `Logo W visual apex is not centered relative to the astrolabe, or its relief layers drifted: ${JSON.stringify({ letter: iconGeometry.letter, window: iconGeometry.window, visualAnchor: iconGeometry.letterVisualAnchor, assemblyTransform: iconGeometry.letterAssemblyTransform })}`,
    );
  }
  if (!iconGeometry.window || !iconGeometry.letter) {
    throw new Error("Logo geometry bounds are unavailable.");
  }
  const horizontalGaps = [
    iconGeometry.letter.x - iconGeometry.window.x,
    iconGeometry.window.x +
      iconGeometry.window.width -
      iconGeometry.letter.x -
      iconGeometry.letter.width,
  ];
  const verticalGaps = [
    iconGeometry.letter.y - iconGeometry.window.y,
    iconGeometry.window.y +
      iconGeometry.window.height -
      iconGeometry.letter.y -
      iconGeometry.letter.height,
  ];
  const windowRadius = iconGeometry.window.width / 2;
  const windowStageGap = iconGeometry.stage.y - iconGeometry.window.y - iconGeometry.window.height;
  if (
    horizontalGaps[0] < 39 ||
    horizontalGaps[0] > 40 ||
    horizontalGaps[1] < 4.4 ||
    horizontalGaps[1] > 5.2 ||
    verticalGaps.some((gap) => gap < 32.3 || gap > 33) ||
    Math.abs(verticalGaps[0] - verticalGaps[1]) > 0.25 ||
    iconGeometry.maxLetterRadius < windowRadius + 18 ||
    Math.abs(windowStageGap + 0.94) > 0.11
  ) {
    throw new Error(
      `Archless astrolabe, visually anchored W, and stage do not keep the intended enlarged proportions and continuous join: ${JSON.stringify({ horizontalGaps, verticalGaps, windowRadius, maxLetterRadius: iconGeometry.maxLetterRadius, windowStageGap })}`,
    );
  }
  if (
    iconGeometry.radialRaysPresent ||
    iconGeometry.windowGuideRadius !== "99" ||
    iconGeometry.windowHubRadius !== "43" ||
    iconGeometry.windowCoreRadius !== "29" ||
    iconGeometry.orbitGeometry.join(";") !==
      "256|246|91|38|;256|246|91|38|rotate(60 256 246);256|246|91|38|rotate(-60 256 246)" ||
    iconGeometry.starGeometry.join(";") !== "347|246|6;210.5|167.2|5;210.5|324.8|5"
  ) {
    throw new Error(
      `Celestial-orbit astrolabe geometry drifted: ${JSON.stringify({ orbits: iconGeometry.orbitGeometry, stars: iconGeometry.starGeometry, guide: iconGeometry.windowGuideRadius, hub: iconGeometry.windowHubRadius, core: iconGeometry.windowCoreRadius, radialRaysPresent: iconGeometry.radialRaysPresent })}`,
    );
  }
  if (
    iconGeometry.outerArchPresent ||
    iconGeometry.innerArchPresent ||
    iconGeometry.crownGemPresent
  ) {
    throw new Error(
      `Archless logo restored a removed arcade or crown gem: ${JSON.stringify({ outerArchPresent: iconGeometry.outerArchPresent, innerArchPresent: iconGeometry.innerArchPresent, crownGemPresent: iconGeometry.crownGemPresent })}`,
    );
  }
  if (
    iconGeometry.windowGradient !== "translate(256 246) rotate(90) scale(126)" ||
    iconGeometry.metalAxis.join("|") !== "256|256"
  ) {
    throw new Error(`Logo light axes are not centered: ${JSON.stringify(iconGeometry)}`);
  }
  if (
    iconGeometry.lightBeamPath !== "M170 0h172l91 438H79z" ||
    !iconGeometry.beamRendered ||
    iconGeometry.beamRendered.x > 79.1 ||
    iconGeometry.beamRendered.x + iconGeometry.beamRendered.width < 432.9 ||
    iconGeometry.beamRendered.y > 0.1 ||
    iconGeometry.beamRendered.y + iconGeometry.beamRendered.height < 437.9
  ) {
    throw new Error(
      `Logo spotlight is not broad enough for the enlarged archless composition: ${JSON.stringify({ path: iconGeometry.lightBeamPath, bounds: iconGeometry.beamRendered })}`,
    );
  }
  if (
    !iconGeometry.border ||
    iconGeometry.border.x < 8 ||
    iconGeometry.border.y < 8 ||
    iconGeometry.border.x + iconGeometry.border.width > 504 ||
    iconGeometry.border.y + iconGeometry.border.height > 504
  ) {
    throw new Error(
      `Logo border does not retain its safe inset: ${JSON.stringify(iconGeometry.border)}`,
    );
  }
  if (!iconGeometry.emblem) {
    throw new Error("Rendered logo emblem bounds are unavailable.");
  }
  if (
    !iconGeometry.windowComposition ||
    iconGeometry.windowCompositionTransform !==
      "translate(256 228) scale(1.36) translate(-256 -246)" ||
    iconGeometry.stageGeometry.join("|") !== "256|404.9|140|16" ||
    Math.abs(iconGeometry.windowComposition.centerX - 256) > 0.2 ||
    Math.abs(iconGeometry.windowComposition.centerY - 242.08) > 0.3 ||
    Math.abs(iconGeometry.windowCenter.x - 256) > 0.11 ||
    Math.abs(iconGeometry.windowCenter.y - 228) > 0.11 ||
    Math.abs(iconGeometry.stage.centerX - 256) > 0.11 ||
    Math.abs(iconGeometry.stage.centerY - 404.9) > 0.11 ||
    Math.abs(iconGeometry.stage.y + iconGeometry.stage.height - 420.9) > 0.11
  ) {
    throw new Error(
      `Logo astrolabe and visually anchored letter are not centered in the enlarged archless composition, or the widened symmetric stage drifted: ${JSON.stringify({ windowComposition: iconGeometry.windowComposition, transform: iconGeometry.windowCompositionTransform, windowCenter: iconGeometry.windowCenter, visualAnchor: iconGeometry.letterVisualAnchor, stage: iconGeometry.stage, stageGeometry: iconGeometry.stageGeometry, windowStageGap })}`,
    );
  }
  if (!iconGeometry.windowRendered || !iconGeometry.stageRendered) {
    throw new Error("Rendered logo boundary geometry is unavailable.");
  }
  const windowRenderedDiameter = iconGeometry.windowRendered.width;
  const emblemHorizontalGaps = [
    iconGeometry.emblem.x,
    512 - iconGeometry.emblem.x - iconGeometry.emblem.width,
  ];
  const emblemVerticalGaps = [
    iconGeometry.emblem.y,
    512 - iconGeometry.emblem.y - iconGeometry.emblem.height,
  ];
  if (
    iconGeometry.emblemTransform !==
      "translate(0 18.4) translate(256 246) scale(1.24) translate(-256 -246)" ||
    windowRenderedDiameter < 400 ||
    windowRenderedDiameter > 402 ||
    emblemHorizontalGaps.some((gap) => gap < 55 || gap > 57) ||
    Math.abs(emblemHorizontalGaps[0] - emblemHorizontalGaps[1]) > 0.2 ||
    emblemVerticalGaps[0] < 40 ||
    emblemVerticalGaps[0] > 43 ||
    emblemVerticalGaps[1] < 30 ||
    emblemVerticalGaps[1] > 32 ||
    iconGeometry.emblem.y + iconGeometry.emblem.height > 482
  ) {
    throw new Error(
      `Archless logo does not keep the enlarged astrolabe and stage within the safe complete-emblem bounds: ${JSON.stringify({ emblem: iconGeometry.emblem, window: iconGeometry.windowRendered, stage: iconGeometry.stageRendered, emblemHorizontalGaps, emblemVerticalGaps, transform: iconGeometry.emblemTransform })}`,
    );
  }

  await iconPage.goto(`http://127.0.0.1:${port}/payroll-calcualtion/icons/app-icon.svg`, {
    waitUntil: "networkidle",
  });
  await iconPage.locator("#logo-letter").waitFor({ timeout: 30_000 });
  const staticIconPalette = await iconPage.evaluate(() => {
    const computedColor = (selector, property) => {
      const element = document.querySelector(selector);
      return element ? getComputedStyle(element)[property] : null;
    };
    return {
      background: computedColor(".logo-background-start", "stopColor"),
      astrolabe: computedColor(".logo-window-center", "stopColor"),
      metal: computedColor(".logo-metal-mid", "stopColor"),
      orbit: computedColor(".logo-window-orbits", "stroke"),
      letterFace: computedColor(".logo-letter-face-light", "stopColor"),
      letterShadow: computedColor(".logo-letter", "stroke"),
      letterDepth: computedColor(".logo-letter-depth", "stroke"),
      letterRim: computedColor(".logo-letter-rim", "stroke"),
    };
  });
  const acceptedStaticIconPalette = {
    background: "rgb(58, 21, 29)",
    astrolabe: "rgb(85, 36, 46)",
    metal: "rgb(204, 163, 79)",
    orbit: "rgb(216, 183, 109)",
    letterFace: "rgb(255, 245, 222)",
    letterShadow: "rgb(168, 95, 56)",
    letterDepth: "rgb(39, 11, 15)",
    letterRim: "rgb(225, 187, 99)",
  };
  if (JSON.stringify(staticIconPalette) !== JSON.stringify(acceptedStaticIconPalette)) {
    throw new Error(
      `Static PWA icon did not retain the accepted Burgundy Antique Gold palette: ${JSON.stringify(staticIconPalette)}`,
    );
  }
  await iconPage.close();

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
