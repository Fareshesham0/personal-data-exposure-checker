import { defineConfig, devices } from "@playwright/test";

// Prefer the Replit proxy origin so API calls (served on a different port)
// are routed correctly. Fall back to the Vite dev server when running outside
// Replit (note: cross-port `/api/*` calls will only work via the proxy).
const PORT = Number(process.env.PORT) || 22530;
const BASE_PATH =
  process.env.BASE_PATH && process.env.BASE_PATH.length > 0
    ? process.env.BASE_PATH
    : "/";
const BASE_URL =
  process.env.E2E_BASE_URL ??
  (process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}${BASE_PATH === "/" ? "/" : BASE_PATH}`
    : `http://localhost:${PORT}${BASE_PATH === "/" ? "/" : BASE_PATH}`);

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    headless: true,
    acceptDownloads: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // When the dev server is already running (the typical case in this
  // workspace, where it is managed by the `artifacts/exposure-checker: web`
  // workflow), reuse it. Otherwise boot one for the test run. The dev server
  // alone does not include the API; tests must run against the Replit proxy
  // origin (set via REPLIT_DEV_DOMAIN) so cross-port `/api/*` calls resolve.
  webServer: process.env.E2E_SKIP_WEB_SERVER
    ? undefined
    : {
        command: "pnpm --filter @workspace/exposure-checker run dev",
        url: `http://localhost:${PORT}${BASE_PATH === "/" ? "/" : BASE_PATH}`,
        reuseExistingServer: true,
        timeout: 60_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
