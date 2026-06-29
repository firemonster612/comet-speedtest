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
      command:
        "pnpm --filter @comet-speedtest/production build && pnpm --filter @comet-speedtest/production preview --host 127.0.0.1 --port 4173",
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
  ],
});
