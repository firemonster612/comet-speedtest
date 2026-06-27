import { afterEach, describe, expect, it, vi } from "vitest";

import { loadProductionConfig } from "./loadProductionConfig";

describe("loadProductionConfig", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and normalizes the production runtime config", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          targets: {
            download: "/download.bin",
            upload: "/upload",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const config = await loadProductionConfig();

    expect(config.diagnostics.source).toBe("/lightspeed.config.json");
    expect(config.targets.download).toBe("http://localhost:3000/download.bin");
    expect(config.test.download.workers).toBe(4);
  });

  it("surfaces load failures before the widget is rendered", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    await expect(loadProductionConfig()).rejects.toThrow(
      "Failed to load runtime config",
    );
  });
});
