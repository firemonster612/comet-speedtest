import { expect, test, type Page } from "@playwright/test";

test("production app loads runtime config and renders the speed test widget", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4173/");

  await expect(
    page.getByRole("heading", { name: "Internet Speed Test" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /go/i })).toBeEnabled();
});

test("production app completes a real worker-backed run against fixture endpoints", async ({
  page,
}) => {
  await routeFixtureSpeedTest(page);

  await page.goto("http://127.0.0.1:4173/");
  await page.getByRole("button", { name: /go/i }).click();

  await expect(page.getByText("Test complete.")).toBeVisible({ timeout: 15_000 });
  const quality = page.getByRole("region", { name: "Connection quality" });
  await expect(
    quality.getByRole("heading", { name: "Connection quality" }),
  ).toBeVisible();
  await quality.getByText("Show breakdown").click();
  await expect(quality.getByText("Gaming", { exact: true })).toBeVisible();
  await expect(quality.getByText("Streaming", { exact: true })).toBeVisible();
  await expect(quality.getByText("Video calls", { exact: true })).toBeVisible();
  const results = page.locator(".ls-results");
  await expect(results.locator("strong")).toHaveCount(2);
  await expect(results.getByText("Mbps", { exact: true })).toHaveCount(2);
});

test("production result submission posts once per completed run", async ({ page }) => {
  let submissionCount = 0;
  let postedBody: Record<string, unknown> | null = null;
  await routeFixtureSpeedTest(page, { submitUrl: "/fixture/results" });
  await page.route("**/fixture/results", async (route) => {
    submissionCount += 1;
    postedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 204 });
  });

  await page.goto("http://127.0.0.1:4173/");
  await page.getByRole("button", { name: /go/i }).click();

  await expect(page.getByText("Test complete.")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => submissionCount).toBe(1);
  await page.waitForTimeout(500);
  expect(submissionCount).toBe(1);
  expect(postedBody).toMatchObject({
    schemaVersion: "comet-result-record/v1",
    result: { runId: expect.any(String) },
    privacy: { rawSamples: "included" },
  });
});

test("production runs against a configured target profile", async ({ page }) => {
  const requestedUrls: string[] = [];
  await routeFixtureSpeedTest(page, {
    targets: {
      download: "/fixture/default/download.bin",
      upload: "/fixture/default/upload",
      latency: "/fixture/default/latency",
    },
    targetProfiles: [
      {
        id: "slow",
        label: "Slow",
        targets: {
          download: "/fixture/slow/download.bin",
          upload: "/fixture/slow/upload",
          latency: "/fixture/slow/latency",
        },
      },
      {
        id: "fast",
        label: "Fast",
        targets: {
          download: "/fixture/fast/download.bin",
          upload: "/fixture/fast/upload",
          latency: "/fixture/fast/latency",
        },
      },
    ],
    targetSelection: { strategy: "forced", targetId: "fast" },
  });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.includes("/fixture/slow/") && !url.includes("/fixture/fast/")) {
      await route.fallback();
      return;
    }
    if (url.includes("/fixture/fast/download.bin")) {
      requestedUrls.push(url);
      await route.fulfill({
        body: Buffer.alloc(512 * 1024, 1),
        contentType: "application/octet-stream",
        status: 200,
      });
      return;
    }
    if (url.includes("/fixture/fast/upload")) {
      requestedUrls.push(url);
    }
    await route.fulfill({ status: 204 });
  });

  await page.goto("http://127.0.0.1:4173/");
  await page.getByRole("button", { name: /go/i }).click();

  await expect(page.getByText("Test complete.")).toBeVisible({ timeout: 15_000 });
  expect(requestedUrls.some((url) => url.includes("/fixture/fast/download.bin"))).toBe(
    true,
  );
  expect(requestedUrls.some((url) => url.includes("/fixture/fast/upload"))).toBe(true);
});

test("production applies theme variables from runtime config", async ({ page }) => {
  await routeFixtureSpeedTest(page, {
    theme: {
      colorScheme: "dark",
      primaryColor: "#2255aa",
      accentColor: "#dd7755",
      backgroundColor: "#111827",
      surfaceColor: "#1f2937",
      textColor: "#f9fafb",
      mutedTextColor: "#cbd5e1",
      borderColor: "#475569",
    },
  });

  await page.goto("http://127.0.0.1:4173/");
  // Theme tokens + the .dark class are applied to <html> so portaled UI (Base UI
  // Select popups render on document.body) inherits them too.
  const html = page.locator("html");

  await expect(html).toHaveAttribute("data-color-scheme", "dark");
  await expect(html).toHaveAttribute("data-effective-color-scheme", "dark");
  await expect(html).toHaveClass(/dark/);
  await expect
    .poll(() =>
      page
        .locator(".production-shell")
        .evaluate((element) =>
          getComputedStyle(element).getPropertyValue("--primary").trim(),
        ),
    )
    .toBe("#2255aa");
});

test("production keeps long config errors within the viewport", async ({ page }) => {
  const longPath = `/fixture/${"download-segment-".repeat(40)}.bin`;
  const longUnknownField = `unexpected${"Field".repeat(80)}`;
  await page.route("**/comet.config.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        [longUnknownField]: true,
        content: {
          title: "Internet Speed Test",
          subtitle: `Endpoint failed: ${longPath}`,
        },
        targets: { download: "", upload: longPath },
      },
    });
  });

  await page.goto("http://127.0.0.1:4173/");
  await expect(page.getByRole("alert")).toContainText("config-invalid");
  await expect(page.getByRole("alert")).toContainText("targets.download");
  await expect(page.getByRole("alert")).toContainText(longUnknownField);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    )
    .toBe(true);
});

async function routeFixtureSpeedTest(
  page: Page,
  options: {
    submitUrl?: string;
    theme?: Record<string, string>;
    targets?: { download: string; upload: string; latency: string };
    targetProfiles?: Array<{
      id: string;
      label?: string;
      targets: { download: string; upload: string; latency: string };
    }>;
    targetSelection?: { strategy: "lowest-latency" | "forced"; targetId?: string };
  } = {},
): Promise<void> {
  const targets = options.targets ?? {
    download: "/fixture/download.bin",
    upload: "/fixture/upload",
    latency: "/fixture/latency",
  };
  await page.route("**/comet.config.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        targets,
        targetProfiles: options.targetProfiles,
        targetSelection: options.targetSelection,
        theme: options.theme,
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
        result: { includeRawSamples: true, submitUrl: options.submitUrl ?? null },
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
  await page.route("**/fixture/upload", async (route) => {
    await route.fulfill({ status: 204 });
  });
}
