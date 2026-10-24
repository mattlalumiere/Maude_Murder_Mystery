import { defineConfig, devices } from "@playwright/test";

// E2E runs against the local stack (make up) at BASE_URL, default http://localhost:3000.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "mobile-small", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 640 } } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "tv", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } } },
  ],
});
