import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: "list",
  use: {
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node tests/browser/upload-fixture-server.mjs",
      reuseExistingServer: !process.env.CI,
      url: "http://127.0.0.1:4175/uploads",
    },
    {
      command:
        "pnpm --filter @comet-speedtest/production-app build && pnpm --filter @comet-speedtest/production build && node packages/production/bin/comet-speedtest.js build --root tests/browser/fixtures/production-deployable && node packages/production/bin/comet-speedtest.js preview --root tests/browser/fixtures/production-deployable --host 127.0.0.1 --port 4173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      url: "http://127.0.0.1:4173/",
    },
    {
      command:
        "pnpm --filter @comet-speedtest/playground build && pnpm --filter @comet-speedtest/playground preview --host 127.0.0.1 --port 4174",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      url: "http://127.0.0.1:4174/",
    },
  ],
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "firefox-desktop",
      use: { ...devices["Desktop Firefox"] },
    },
  ],
});
