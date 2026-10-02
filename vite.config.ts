/// <reference types="vitest/config" />

import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const fontAssetManifest = JSON.parse(
  readFileSync(new URL("./public/fonts/asset-manifest.json", import.meta.url), "utf8"),
) as { version?: unknown };

if (
  typeof fontAssetManifest.version !== "string" ||
  !/^[a-f0-9]{16}$/.test(fontAssetManifest.version)
) {
  throw new Error("Run npm run fonts:sync to generate a content-versioned font manifest.");
}

const fontAssetVersion = fontAssetManifest.version;

export default defineConfig({
  base: "/payroll-calcualtion/",
  define: {
    __FONT_ASSET_VERSION__: JSON.stringify(fontAssetVersion),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "icons/app-icon.svg",
        "icons/app-icon-192.png",
        "icons/app-icon-512.png",
        "fonts/asset-manifest.json",
      ],
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,json,webmanifest}"],
        globIgnores: ["fonts/**"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/fonts\/.*\.(?:css|woff2)$/,
            handler: "CacheFirst",
            options: {
              cacheName: `worthwhile-fonts-${fontAssetVersion}`,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "Worthwhile · California Income Planner",
        short_name: "Worthwhile",
        description: "从每月生活目标反推在美国加州所需税前年薪。",
        theme_color: "#170305",
        background_color: "#170305",
        display: "standalone",
        start_url: "./",
        icons: [
          {
            src: "icons/app-icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/app-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/app-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "icons/app-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/firebase/**/*.emulator.test.ts"],
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
});
