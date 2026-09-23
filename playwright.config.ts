import { defineConfig, devices } from "@playwright/test";

// Browser E2E against the running app (npm run dev) with the synthetic demo dataset.
// Start the server first, or let Playwright start it (reuses one already on :3100).
const BASE = process.env.BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: BASE, timezoneId: "Asia/Dubai", trace: "retain-on-failure", navigationTimeout: 120_000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: { command: "npm run dev", url: `${BASE}/login`, reuseExistingServer: true, timeout: 240_000 },
});
