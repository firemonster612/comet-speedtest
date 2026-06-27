import { describe, expect, it } from "vitest";

import type { SpeedTestResult } from "../../results/resultTypes";
import { compareAgainstPlan } from "../compareAgainstPlan";

function result(
  downloadMbps: number | null,
  uploadMbps: number | null,
): SpeedTestResult {
  return {
    runId: "run-1",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:05.000Z",
    configHash: "abc123",
    download: downloadMbps === null ? null : throughput(downloadMbps),
    upload: uploadMbps === null ? null : throughput(uploadMbps),
    latency: { idle: null, underDownloadLoad: null, underUploadLoad: null },
    bufferbloat: {
      idleLatencyMs: null,
      loadedLatencyMs: null,
      addedLatencyMs: null,
      grade: null,
      download: null,
      upload: null,
    },
    diagnostics: {
      userAgent: "test",
      testSelection: {
        phases: ["download", "upload"],
        loadedLatency: { download: false, upload: false },
      },
      requestedTransports: { download: "fetch-stream", upload: "xhr-chunked" },
      actualTransports: { download: "fetch-stream", upload: "xhr-chunked" },
      measurementBasis: { download: "final", upload: "final" },
      fallbackReasons: [],
      workersRequested: { download: 1, upload: 1 },
      workersStarted: { download: 1, upload: 1 },
      capabilityReport: {
        fetchResponseStreaming: true,
        fetchRequestStreaming: true,
        xhrUpload: true,
        workers: true,
        abortController: true,
      },
      configSource: "test",
      errors: [],
    },
  };
}

function throughput(mbps: number) {
  return {
    bitsPerSecond: mbps * 1_000_000,
    bytesTransferred: 1,
    durationMs: 1,
    percentile: 75,
    sampleIntervalMs: 100,
    samplesPerWindow: 1,
    measuredWindowCount: 1,
    warmupWindowCount: 0,
  };
}

describe("compareAgainstPlan", () => {
  it("reports meets-plan when measured ratios clear the threshold", () => {
    expect(
      compareAgainstPlan(result(900, 95), {
        downloadMbps: 1000,
        uploadMbps: 100,
      }),
    ).toMatchObject({
      schemaVersion: "lightspeed-plan-comparison/v1",
      status: "meets-plan",
      downloadRatio: 0.9,
      uploadRatio: 0.95,
      limitingMetrics: [],
    });
  });

  it("reports below-plan with limiting metrics", () => {
    expect(
      compareAgainstPlan(result(500, 95), {
        downloadMbps: 1000,
        uploadMbps: 100,
      }),
    ).toMatchObject({
      status: "below-plan",
      limitingMetrics: ["download"],
    });
  });

  it("returns unknown when an expected direction was not measured", () => {
    expect(
      compareAgainstPlan(result(null, 95), {
        downloadMbps: 1000,
        uploadMbps: 100,
      }),
    ).toMatchObject({
      status: "unknown",
      downloadRatio: null,
      limitingMetrics: [],
    });
  });
});
