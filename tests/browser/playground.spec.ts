import { expect, test, type Page } from "@playwright/test";

import { uploadFixtureOrigin } from "./uploadFixture";

test("playground loads a profile, edits config, and shows diagnostics", async ({
  page,
}) => {
  await routeFixtureSpeedTest(page);
  await page.goto("http://127.0.0.1:4174/?config=/comet.config.json");

  await expect(
    page.getByRole("heading", { name: "Speed test playground" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Endpoints" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByLabel("Download URL")).toHaveValue("/fixture/download.bin");

  await page.getByRole("tab", { name: "Throughput" }).click();
  await page.getByLabel("Upload workers").fill("6");

  await page.getByRole("tab", { name: "Config" }).click();
  await expect(
    page.getByRole("textbox", { name: "Import or export JSON" }),
  ).toHaveValue(/"workers": 6/);
  const exportedText = await page
    .getByRole("textbox", { name: "Import or export JSON" })
    .inputValue();
  const exported = JSON.parse(exportedText) as {
    targets: { download: string; upload: string };
    test?: { upload?: { workers?: number } };
  };
  expect(exported.targets.download).toBe("/fixture/download.bin");
  expect(exported.test?.upload?.workers).toBe(6);

  await page.getByRole("tab", { name: "Endpoints" }).click();
  await page
    .getByRole("button", { name: /go/i })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByText("Test complete.")).toBeVisible({ timeout: 15_000 });
});

async function routeFixtureSpeedTest(page: Page): Promise<void> {
  await page.route("http://127.0.0.1:4174/comet.config.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        brand: {
          name: "Comet Lab",
          serverLabel: "Local lab profile",
        },
        targets: {
          download: "/fixture/download.bin",
          upload: `${uploadFixtureOrigin}/fixture/upload`,
          latency: "/fixture/latency",
        },
        result: {
          submitUrl: null,
          includeRawSamples: true,
        },
        test: {
          download: { workers: 1, maxDurationMs: 1000 },
          upload: {
            workers: 1,
            transport: "xhr-chunked",
            allowFallback: false,
            fallbackChunkSizeBytes: 1024,
            maxDurationMs: 1000,
          },
          sampling: {
            intervalMs: 150,
            samplesPerWindow: 1,
            measuredWindowCount: 6,
            warmupWindowCount: 0,
          },
          latency: {
            enabled: true,
            idleRequests: 1,
            loadedIntervalMs: 100,
            timeoutMs: 1000,
            method: "HEAD",
          },
        },
      },
    });
  });
  await page.route("**/fixture/download.bin?**", async (route) => {
    await route.fulfill({
      body: Buffer.alloc(512 * 1024, 1),
      contentType: "application/octet-stream",
      status: 200,
    });
  });
  await page.route("**/fixture/download.bin", async (route) => {
    await route.fulfill({
      body: Buffer.alloc(512 * 1024, 1),
      contentType: "application/octet-stream",
      status: 200,
    });
  });
  await page.route("**/fixture/latency", async (route) => {
    await route.fulfill({ status: 204 });
  });
}
