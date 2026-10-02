/* global axe, document, getComputedStyle, requestAnimationFrame, window */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";
import process from "node:process";

import { chromium } from "playwright-core";

const root = process.cwd();
const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");
const longCategoryName = "跨城市家庭照护与长期居住升级计划".repeat(6).slice(0, 120);
const longGoalName = "包含国际旅行学习医疗与紧急储备的长期生活目标".repeat(6).slice(0, 120);
const themes = [
  "绯红绒",
  "蓝午夜",
  "紫午夜 · 琥珀",
  "紫午夜 · 绯红",
  "紫午夜 · 电光蓝",
  "金歌剧",
  "绯歌剧",
];

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
  const port = typeof address === "object" && address ? address.port : 4177;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForSaved(page) {
  await page.locator(".save-indicator.is-saved").waitFor({ state: "attached", timeout: 30_000 });
}

async function assertLayout(page, label) {
  const result = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0;
    };
    const outsideViewport = Array.from(document.querySelectorAll("button, input, select, summary"))
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label:
            element.getAttribute("aria-label") ??
            element.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) ??
            element.tagName,
          left: rect.left,
          right: rect.right,
        };
      })
      .filter(({ left, right }) => left < -1 || right > viewportWidth + 1);
    const clippedContainers = Array.from(
      document.querySelectorAll(
        ".planner-app, .topbar, .planner-nav, .planner-main, .content-view, .goal-row, .category-summary, .summary-stats article, .income-panel",
      ),
    )
      .filter(visible)
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => ({
        selector: element.className,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
    const topControls = Array.from(
      document.querySelectorAll(
        ".topbar > .logo, .topbar > .search-control, .topbar > .theme-control, .topbar > .profile-control, .topbar > .account-control",
      ),
    )
      .filter(visible)
      .map((element) => ({ name: element.className, rect: element.getBoundingClientRect() }));
    const overlaps = [];
    for (let left = 0; left < topControls.length; left += 1) {
      for (let right = left + 1; right < topControls.length; right += 1) {
        const a = topControls[left];
        const b = topControls[right];
        const overlapsHorizontally =
          a.rect.left < b.rect.right - 1 && a.rect.right > b.rect.left + 1;
        const overlapsVertically = a.rect.top < b.rect.bottom - 1 && a.rect.bottom > b.rect.top + 1;
        if (overlapsHorizontally && overlapsVertically) overlaps.push(`${a.name} / ${b.name}`);
      }
    }
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth,
      outsideViewport,
      clippedContainers,
      overlaps,
    };
  });

  if (
    result.documentWidth > result.viewportWidth ||
    result.outsideViewport.length > 0 ||
    result.clippedContainers.length > 0 ||
    result.overlaps.length > 0
  ) {
    throw new Error(`${label} layout failed: ${JSON.stringify(result, null, 2)}`);
  }
}

async function runAccessibilityAudit(page, label) {
  const violations = await page.evaluate(async () => {
    const results = await axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });
    return results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    }));
  });
  if (violations.length > 0) {
    throw new Error(`${label} accessibility audit failed:\n${JSON.stringify(violations, null, 2)}`);
  }
}

async function assertFiftyGoalFixture(page) {
  const directoryButtons = page.locator(".planner-nav > button");
  const categoryCount = (await directoryButtons.count()) - 1;
  let goalCount = 0;
  for (let index = 1; index <= categoryCount; index += 1) {
    await directoryButtons.nth(index).click();
    const more = page.locator(".load-more");
    while (await more.isVisible().catch(() => false)) await more.click();
    goalCount += await page.locator(".goal-row").count();
    await assertLayout(page, `50-goal category ${index}`);
  }
  if (goalCount !== 50) throw new Error(`Expected to traverse 50 goals, found ${goalCount}.`);
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on("console", (message) => consoleMessages.push(message.text()));
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(request.url()));

  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.locator('.planner-app[data-font-status="ready"]').waitFor({ timeout: 30_000 });
  await waitForSaved(page);
  await page.addScriptTag({ path: axePath });

  if (!(await page.getByText("50 个目标", { exact: true }).isVisible())) {
    throw new Error("The accepted 50-goal fixture is not active.");
  }
  await assertFiftyGoalFixture(page);

  await page.getByRole("button", { name: "返回置顶主页" }).click();
  await page.getByRole("button", { name: "管理置顶" }).click();
  const checkedPins = page.getByRole("checkbox", { checked: true });
  while ((await checkedPins.count()) > 0) await checkedPins.first().uncheck();
  await page.getByRole("button", { name: "关闭管理置顶" }).click();
  await page.getByText("主页还没有置顶目标", { exact: true }).waitFor();
  await runAccessibilityAudit(page, "empty pinned state");

  const search = page.getByRole("searchbox", { name: "搜索目标" });
  await search.focus();
  await page.keyboard.type("绝对不存在的目标");
  await page.getByText("没有匹配的目标", { exact: true }).waitFor();
  await runAccessibilityAudit(page, "empty search state");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.press("Backspace");

  await page.getByRole("button", { name: "添加分类" }).click();
  const settings = page.locator('[aria-label="分类设置"]');
  await settings.locator("input").first().fill(longCategoryName);
  await settings.locator("input").first().press("Tab");
  await page.getByRole("button", { name: "关闭分类设置" }).click();
  await page.getByText("这个分类还是空的", { exact: true }).waitFor();
  await runAccessibilityAudit(page, "empty category state");

  await page.getByRole("button", { name: /添加项目/ }).click();
  const goalName = page.locator(".goal-name-input").first();
  await goalName.fill(longGoalName);
  await goalName.press("Tab");
  const amount = page.locator('.row-money-field input[type="number"]').first();
  await amount.fill("500000");
  await amount.press("Tab");
  await waitForSaved(page);

  for (const theme of themes) {
    await page.getByRole("button", { name: /主题/ }).click();
    await page
      .getByRole("dialog", { name: "选择主题" })
      .getByRole("button", { name: new RegExp(theme) })
      .click();
    await page.locator('.planner-app[data-font-status="ready"]').waitFor({ timeout: 30_000 });
    await runAccessibilityAudit(page, `${theme} extreme-content state`);
  }

  for (const viewport of [
    { width: 2000, height: 1100 },
    { width: 1440, height: 1000 },
    { width: 1050, height: 1000 },
    { width: 901, height: 1000 },
    { width: 900, height: 1000 },
    { width: 768, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await assertLayout(page, `${viewport.width}x${viewport.height} extreme-content`);
  }

  const keyboardPage = await context.newPage();
  keyboardPage.on("console", (message) => consoleMessages.push(message.text()));
  keyboardPage.on("pageerror", (error) => pageErrors.push(error.message));
  keyboardPage.on("requestfailed", (request) => failedRequests.push(request.url()));
  await keyboardPage.goto(appUrl, { waitUntil: "networkidle" });
  await keyboardPage.locator('.planner-app[data-font-status="ready"]').waitFor({
    timeout: 30_000,
  });
  for (const expected of ["返回置顶主页", "搜索目标", "主题"]) {
    await keyboardPage.keyboard.press("Tab");
    const focusedName = await keyboardPage.evaluate(() => {
      const element = document.activeElement;
      return element?.getAttribute("aria-label") ?? element?.textContent?.trim() ?? "";
    });
    if (!focusedName.includes(expected)) {
      throw new Error(`Keyboard focus order expected ${expected}, found ${focusedName}.`);
    }
  }
  const focusStyle = await keyboardPage.evaluate(() => {
    const style = getComputedStyle(document.activeElement);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  if (Number.parseFloat(focusStyle.width) < 2 || focusStyle.style === "none") {
    throw new Error(`Keyboard focus is not visibly outlined: ${JSON.stringify(focusStyle)}.`);
  }
  await keyboardPage.keyboard.press("Enter");
  await keyboardPage.getByRole("dialog", { name: "选择主题" }).waitFor();
  await keyboardPage.keyboard.press("Tab");
  await keyboardPage.keyboard.press("Tab");
  await keyboardPage.keyboard.press("Tab");
  const keyboardTheme = await keyboardPage.evaluate(
    () => document.activeElement?.getAttribute("data-theme-value") ?? "",
  );
  if (keyboardTheme !== "midnight") {
    throw new Error(`Keyboard theme order expected midnight, found ${keyboardTheme}.`);
  }
  await keyboardPage.keyboard.press("Enter");
  await keyboardPage.locator('.planner-app[data-theme="midnight"]').waitFor();
  await keyboardPage.close();

  mkdirSync(join(root, "test-results"), { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await assertLayout(page, "final desktop screenshot");
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.scrollTo(0, 0);
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
  await page.screenshot({
    path: join(root, "test-results", "quality-extreme-desktop.png"),
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await assertLayout(page, "final mobile screenshot");
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.scrollTo(0, 0);
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
  await page.screenshot({
    path: join(root, "test-results", "quality-extreme-mobile.png"),
    fullPage: false,
  });

  const sensitiveConsoleData = consoleMessages.filter((message) =>
    [longCategoryName, longGoalName, "500000", "anonymous-local"].some((value) =>
      message.includes(value),
    ),
  );
  if (sensitiveConsoleData.length > 0) {
    throw new Error(
      `Private plan data reached the browser console:\n${sensitiveConsoleData.join("\n")}`,
    );
  }
  if (pageErrors.length > 0) throw new Error(`Browser errors:\n${pageErrors.join("\n")}`);
  if (failedRequests.length > 0) {
    throw new Error(`Quality browser check had failed requests:\n${failedRequests.join("\n")}`);
  }

  console.log(
    "Quality browser check passed: 50 goals, three empty states, 120-character labels, a $500,000 monthly value, seven-theme WCAG scans, keyboard focus, and 320–2000px layouts.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (previewOutput.trim()) console.error(previewOutput.trim());
  process.exitCode = 1;
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
}
