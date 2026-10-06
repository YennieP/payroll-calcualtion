import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

import { chromium } from "playwright-core";

const root = process.cwd();
const sourcePath = join(root, "public", "icons", "app-icon.svg");

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

if (!existsSync(sourcePath)) {
  throw new Error(`Missing source icon: ${sourcePath}`);
}

const executablePath = findChrome();
if (!executablePath) {
  throw new Error(
    "A local Chrome/Chromium executable is required. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.",
  );
}

const svgDataUrl = `data:image/svg+xml;base64,${readFileSync(sourcePath).toString("base64")}`;
const browser = await chromium.launch({ executablePath, headless: true });

try {
  for (const size of [192, 512]) {
    const context = await browser.newContext({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.setContent(
      `<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}img{display:block;width:100%;height:100%}</style><img alt="" src="${svgDataUrl}">`,
    );
    await page.locator("img").waitFor({ state: "visible" });
    await page.locator("img").screenshot({
      path: join(root, "public", "icons", `app-icon-${size}.png`),
      omitBackground: false,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

console.log("Generated 192px and 512px application icons from app-icon.svg.");
