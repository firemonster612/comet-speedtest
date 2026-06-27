import { afterEach, describe, expect, it, vi } from "vitest";

import {
  exportConfig,
  loadRuntimeConfig,
  normalizeConfig,
  validateConfig,
} from "../index";

const minimal = {
  targets: {
    download: "/speedtest/download/large.bin",
    upload: "/speedtest/upload",
  },
};

describe("@lightspeed/config", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes defaults and relative URLs", () => {
    const normalized = normalizeConfig(minimal, {
      baseUrl: "https://speed.example.test/app/",
    });

    expect(normalized.test.download.workers).toBe(4);
    expect(normalized.test.sampling.intervalMs).toBe(500);
    expect(normalized.test.sampling.samplesPerWindow).toBe(6);
    expect(normalized.test.sampling.measuredWindowCount).toBe(5);
    expect(normalized.test.sampling.warmupWindowCount).toBe(1);
    expect(normalized.test.selection).toEqual({
      phases: ["idle-latency", "download", "upload"],
      loadedLatency: { download: true, upload: true },
    });
    expect(normalized.targets.download).toBe(
      "https://speed.example.test/speedtest/download/large.bin",
    );
    expect(normalized.targets.latency).toBe(
      "https://speed.example.test/speedtest/download/large.bin",
    );
    expect(normalized.targetProfiles).toEqual([]);
    expect(normalized.targetSelection).toBeNull();
  });

  it("defaults the reachability and first-byte-timeout knobs", () => {
    const normalized = normalizeConfig(minimal, {
      baseUrl: "https://speed.example.test/",
    });

    expect(normalized.test.latency.reachabilityCheck).toBe(true);
    expect(normalized.test.download.firstByteTimeoutMs).toBe(3000);
    expect(normalized.test.upload.firstByteTimeoutMs).toBe(3000);
  });

  it("accepts overrides and rejects out-of-range reachability knobs", () => {
    const overridden = normalizeConfig(
      {
        targets: { download: "/download", upload: "/upload" },
        test: {
          latency: { reachabilityCheck: false },
          download: { firstByteTimeoutMs: 0 },
          upload: { firstByteTimeoutMs: 8000 },
        },
      },
      { baseUrl: "https://speed.example.test/" },
    );
    expect(overridden.test.latency.reachabilityCheck).toBe(false);
    expect(overridden.test.download.firstByteTimeoutMs).toBe(0);
    expect(overridden.test.upload.firstByteTimeoutMs).toBe(8000);

    const result = validateConfig({
      targets: { download: "/download", upload: "/upload" },
      test: {
        latency: { reachabilityCheck: "yes" },
        download: { firstByteTimeoutMs: -1 },
        upload: { firstByteTimeoutMs: 999_999 },
      },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "test.latency.reachabilityCheck",
        "test.download.firstByteTimeoutMs",
        "test.upload.firstByteTimeoutMs",
      ]),
    );
  });

  it("rejects invalid endpoint and sampling values", () => {
    const result = validateConfig({
      targets: { download: "", upload: "/upload" },
      test: { sampling: { intervalMs: 10, percentile: 200 } },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "targets.download",
        "test.sampling.intervalMs",
        "test.sampling.percentile",
      ]),
    );
  });

  it("rejects malformed object sections instead of normalizing defaults", () => {
    const result = validateConfig({
      ...minimal,
      brand: "Lightspeed",
      content: null,
      test: "fast",
      result: false,
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(["brand", "content", "test", "result"]),
    );
  });

  it("rejects malformed nested test sections", () => {
    const result = validateConfig({
      ...minimal,
      test: {
        download: "fast",
        upload: 4,
        sampling: [],
        latency: false,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "test.download",
        "test.upload",
        "test.sampling",
        "test.latency",
      ]),
    );
  });

  it("rejects malformed simple section fields", () => {
    const result = validateConfig({
      ...minimal,
      brand: { name: 12 },
      content: { title: 12 },
      result: { submitUrl: 42, includeRawSamples: "yes" },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "brand.name",
        "content.title",
        "result.submitUrl",
        "result.includeRawSamples",
      ]),
    );
  });

  it("rejects invalid transport fallback and max duration values", () => {
    const result = validateConfig({
      targets: { download: "/download", upload: "/upload" },
      test: {
        download: {
          maxDurationMs: "fast",
        },
        upload: {
          fallbackTransport: "fetch-stream",
          streamChunkSizeBytes: 0,
          maxDurationMs: -1,
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "test.upload.fallbackTransport",
        "test.upload.streamChunkSizeBytes",
        "test.download.maxDurationMs",
        "test.upload.maxDurationMs",
      ]),
    );
  });

  it("normalizes selected phases and loaded latency settings", () => {
    const normalized = normalizeConfig({
      targets: { download: "/download", upload: "/upload" },
      test: {
        selection: {
          phases: ["upload", "download"],
          loadedLatency: { upload: false },
        },
      },
    });

    expect(normalized.test.selection).toEqual({
      phases: ["download", "upload"],
      loadedLatency: { download: true, upload: false },
    });
  });

  it("normalizes explicit light and dark theme palettes independently", () => {
    const normalized = normalizeConfig({
      ...minimal,
      theme: {
        colorScheme: "system",
        light: {
          primaryColor: "#123456",
          backgroundColor: "#f8fafc",
          textColor: "#111827",
        },
        dark: {
          primaryColor: "#abcdef",
          backgroundColor: "#020617",
          textColor: "#f9fafb",
        },
      },
    });

    expect(normalized.theme.colorScheme).toBe("system");
    expect(normalized.theme.light).toEqual(
      expect.objectContaining({
        primaryColor: "#123456",
        backgroundColor: "#f8fafc",
        textColor: "#111827",
      }),
    );
    expect(normalized.theme.dark).toEqual(
      expect.objectContaining({
        primaryColor: "#abcdef",
        backgroundColor: "#020617",
        textColor: "#f9fafb",
      }),
    );
    expect(normalized.theme.light.surfaceColor).toBeDefined();
    expect(normalized.theme.dark.surfaceColor).toBeDefined();
  });

  it("keeps legacy flat theme colors as light palette shorthand", () => {
    const normalized = normalizeConfig({
      ...minimal,
      theme: {
        primaryColor: "#335577",
        accentColor: "#aa6633",
        backgroundColor: "#fafafa",
        dark: {
          backgroundColor: "#050505",
        },
      },
    });

    expect(normalized.theme.light).toEqual(
      expect.objectContaining({
        primaryColor: "#335577",
        accentColor: "#aa6633",
        backgroundColor: "#fafafa",
      }),
    );
    expect(normalized.theme.dark).toEqual(
      expect.objectContaining({
        primaryColor: "#335577",
        accentColor: "#aa6633",
        backgroundColor: "#050505",
      }),
    );
  });

  it("validates theme palette shape and reports unknown nested color fields", () => {
    const result = validateConfig({
      ...minimal,
      theme: {
        colorScheme: "night",
        light: {
          primaryColor: "#123456",
          shadowColor: "#000000",
        },
        dark: "auto",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(["theme.colorScheme", "theme.dark"]),
    );
    expect(result.unknownFields).toContain("theme.light.shadowColor");
  });

  it("rejects invalid test selection values", () => {
    const result = validateConfig({
      targets: { download: "/download", upload: "/upload" },
      test: {
        selection: {
          phases: ["upload", "upload", "packet-loss"],
          loadedLatency: { upload: "no" },
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "test.selection.phases.1",
        "test.selection.phases.2",
        "test.selection.loadedLatency.upload",
      ]),
    );
  });

  it("reports unknown nested fields without rejecting non-strict production config", () => {
    const result = validateConfig({
      unknownRoot: true,
      targets: {
        download: "/download",
        upload: "/upload",
        unexpectedTarget: "/other",
      },
      test: {
        sampling: {
          intervalMs: 500,
          unexpectedSamplingField: true,
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.unknownFields).toEqual(
      expect.arrayContaining([
        "unknownRoot",
        "targets.unexpectedTarget",
        "test.sampling.unexpectedSamplingField",
      ]),
    );
  });

  it("does not retain unknown fields in normalized config", () => {
    const normalized = normalizeConfig({
      targets: { download: "/download", upload: "/upload" },
      test: {
        sampling: {
          intervalMs: 500,
          unexpectedSamplingField: true,
        },
      },
    } as typeof minimal);

    expect(normalized.diagnostics.unknownFields).toContain(
      "test.sampling.unexpectedSamplingField",
    );
    expect(
      "unexpectedSamplingField" in
        (normalized.test.sampling as unknown as Record<string, unknown>),
    ).toBe(false);
  });

  it("exports production JSON from normalized config", () => {
    const normalized = normalizeConfig(minimal, { baseUrl: "https://x.test/" });
    const exported = JSON.parse(exportConfig(normalized));

    expect(exported.targets.download).toBe(
      "https://x.test/speedtest/download/large.bin",
    );
    expect(exported.diagnostics).toBeUndefined();
  });

  it("normalizes result submission URLs against the base URL", () => {
    const normalized = normalizeConfig(
      {
        ...minimal,
        result: { submitUrl: "/results" },
      },
      { baseUrl: "https://x.test/app/" },
    );

    expect(normalized.result.submitUrl).toBe("https://x.test/results");
  });

  it("normalizes target profile URLs against the base URL", () => {
    const normalized = normalizeConfig(
      {
        ...minimal,
        targetProfiles: [
          {
            id: "nyc",
            label: "New York",
            metadata: { region: "east" },
            targets: {
              download: "/nyc/download.bin",
              upload: "/nyc/upload",
            },
          },
          {
            id: "dal",
            targets: {
              download: "https://dal.example.test/download.bin",
              upload: "https://dal.example.test/upload",
              latency: "/dal/latency",
            },
          },
        ],
        targetSelection: { strategy: "forced", targetId: "dal" },
      },
      { baseUrl: "https://speed.example.test/app/" },
    );

    expect(normalized.targetProfiles).toEqual([
      {
        id: "nyc",
        label: "New York",
        metadata: { region: "east" },
        targets: {
          download: "https://speed.example.test/nyc/download.bin",
          upload: "https://speed.example.test/nyc/upload",
          latency: "https://speed.example.test/nyc/download.bin",
        },
      },
      {
        id: "dal",
        targets: {
          download: "https://dal.example.test/download.bin",
          upload: "https://dal.example.test/upload",
          latency: "https://speed.example.test/dal/latency",
        },
      },
    ]);
    expect(normalized.targetSelection).toEqual({
      strategy: "forced",
      targetId: "dal",
    });
  });

  it("rejects invalid target profile and selection values", () => {
    const result = validateConfig({
      ...minimal,
      targetProfiles: [
        {
          id: "nyc",
          targets: { download: "/nyc/download", upload: "/nyc/upload" },
          unknownProfileField: true,
        },
        {
          id: "nyc",
          targets: {
            download: "",
            upload: "/dup/upload",
            unknownTargetField: true,
          },
        },
      ],
      targetSelection: { strategy: "forced", targetId: "missing" },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "targetProfiles.1.id",
        "targetProfiles.1.targets.download",
        "targetSelection.targetId",
      ]),
    );
    expect(result.unknownFields).toEqual(
      expect.arrayContaining([
        "targetProfiles.0.unknownProfileField",
        "targetProfiles.1.targets.unknownTargetField",
      ]),
    );
  });

  it("requires a target id for forced selection", () => {
    const result = validateConfig({
      ...minimal,
      targetProfiles: [
        { id: "nyc", targets: { download: "/nyc/download", upload: "/nyc/upload" } },
      ],
      targetSelection: { strategy: "forced" },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toContain(
      "targetSelection.targetId",
    );
  });

  it("exports runtime drafts without absolutizing deploy-relative targets", () => {
    const exported = JSON.parse(exportConfig(minimal));

    expect(exported.targets.download).toBe("/speedtest/download/large.bin");
    expect(exported.targets.upload).toBe("/speedtest/upload");
  });

  it("exports normalized target profiles and target selection", () => {
    const normalized = normalizeConfig(
      {
        ...minimal,
        targetProfiles: [
          { id: "nyc", targets: { download: "/nyc/download", upload: "/nyc/upload" } },
        ],
        targetSelection: { strategy: "lowest-latency" },
      },
      { baseUrl: "https://x.test/" },
    );
    const exported = JSON.parse(exportConfig(normalized));

    expect(exported.targetProfiles[0].targets.download).toBe(
      "https://x.test/nyc/download",
    );
    expect(exported.targetSelection).toEqual({ strategy: "lowest-latency" });
  });

  it("loads runtime JSON through the fetch contract", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(minimal), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const loaded = await loadRuntimeConfig({
      url: "https://speed.example.test/lightspeed.config.json",
    });

    expect(loaded.targets.download).toBe("/speedtest/download/large.bin");
    expect(fetch).toHaveBeenCalledWith(
      "https://speed.example.test/lightspeed.config.json",
      expect.objectContaining({
        headers: { accept: "application/json" },
      }),
    );
  });

  it("surfaces invalid runtime JSON with a config-specific error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!doctype html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(
      loadRuntimeConfig({
        url: "https://speed.example.test/lightspeed.config.json",
      }),
    ).rejects.toMatchObject({
      code: "config-load-failed",
      message: expect.stringContaining("Runtime config from") as string,
      recoverable: true,
    });
  });

  it("surfaces HTTP load failures with config-load-failed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 }),
    );

    await expect(loadRuntimeConfig({ url: "/missing.json" })).rejects.toMatchObject({
      code: "config-load-failed",
      diagnostics: { status: 404, url: "/missing.json" },
    });
  });

  it("throws config-invalid with validation diagnostics", () => {
    expect(() =>
      normalizeConfig({
        targets: { download: "", upload: "/upload" },
        test: { sampling: { percentile: 120 } },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: "config-invalid",
        diagnostics: expect.objectContaining({
          validation: expect.objectContaining({
            issues: expect.arrayContaining([
              expect.objectContaining({ path: "targets.download" }),
              expect.objectContaining({ path: "test.sampling.percentile" }),
            ]) as unknown[],
          }),
        }),
      }),
    );
  });
});
