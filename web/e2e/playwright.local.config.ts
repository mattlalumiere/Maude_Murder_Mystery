import { defineConfig } from "@playwright/test";
import base from "../playwright.config";

// Local override used by T5: drives the installed Brave (Chromium based) instead of a downloaded browser.
// Usage (server must already run on :3100): npx playwright test -c e2e/playwright.local.config.ts --project=mobile
const BRAVE = process.env.BRAVE_PATH ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const outputDir = process.env.E2E_OUT ?? "/tmp/mm-e2e-results";

export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "**/*.spec.ts",
  outputDir,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    ...base.use,
    baseURL: process.env.BASE_URL ?? "http://localhost:3100",
    browserName: "chromium",
    launchOptions: { executablePath: BRAVE, args: ["--disable-gpu", "--no-first-run", "--disable-features=Translate"] },
    trace: "off",
  },
  projects: (base.projects ?? []).map((p) => ({ ...p, use: { ...p.use, browserName: "chromium" as const, defaultBrowserType: "chromium" as const } })),
});
