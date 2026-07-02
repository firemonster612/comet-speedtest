import type { SpeedTestResult } from "@comet-speedtest/core";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TransportDiagnostics } from "./TransportDiagnostics";

describe("TransportDiagnostics", () => {
  it("renders submission diagnostics without changing measured result fields", () => {
    const result = makeResult({
      ok: false,
      status: 503,
      message: "Result submission failed with HTTP 503.",
    });

    const markup = renderToString(<TransportDiagnostics result={result} />);

    expect(markup).toContain("Submission");
    expect(markup).toContain("Failed");
    expect(markup).toContain("HTTP 503");
    expect(markup).toContain("Result submission failed with HTTP 503.");
    expect(result.download?.bitsPerSecond).toBe(100_000_000);
  });

  it("renders diagnostic errors", () => {
    const result = makeResult(undefined);
    result.diagnostics.errors.push({
      code: "worker-start-failed",
      message: "download-2 failed to start",
      phase: "download",
      recoverable: true,
    });

    const markup = renderToString(<TransportDiagnostics result={result} />);

    expect(markup).toContain("Errors");
    expect(markup).toContain("worker-start-failed");
    expect(markup).toContain("download-2 failed to start");
  });
});

function makeResult(
  submission: SpeedTestResult["diagnostics"]["submission"],
): SpeedTestResult {
  return {
    runId: "run-1",
    startedAt: "2026-06-20T00:00:00.000Z",
    completedAt: "2026-06-20T00:00:10.000Z",
    configHash: "hash",
    download: {
      bitsPerSecond: 100_000_000,
      bytesTransferred: 125_000_000,
      durationMs: 10_000,
      percentile: 75,
      sampleIntervalMs: 500,
      samplesPerWindow: 6,
      measuredWindowCount: 5,
      warmupWindowCount: 1,
    },
    upload: {
      bitsPerSecond: 40_000_000,
      bytesTransferred: 50_000_000,
      durationMs: 10_000,
      percentile: 75,
      sampleIntervalMs: 500,
      samplesPerWindow: 6,
      measuredWindowCount: 5,
      warmupWindowCount: 1,
    },
    latency: {
      idle: emptyLatency(),
      underDownloadLoad: emptyLatency(),
      underUploadLoad: emptyLatency(),
    },
    bufferbloat: {
      idleLatencyMs: null,
      loadedLatencyMs: null,
      addedLatencyMs: null,
      grade: null,
      download: null,
      upload: null,
    },
    diagnostics: {
      userAgent: "vitest",
      testSelection: {
        phases: ["idle-latency", "download", "upload"],
        loadedLatency: { download: true, upload: true },
      },
      requestedTransports: { download: "auto", upload: "auto" },
      actualTransports: { download: "fetch-stream", upload: "xhr-chunked" },
      measurementBasis: {
        download: "response stream bytes read",
        upload: "xhr upload progress events",
      },
      fallbackReasons: ["fetch request streaming unavailable"],
      workersRequested: { download: 4, upload: 4 },
      workersStarted: { download: 4, upload: 4 },
      capabilityReport: {
        fetchResponseStreaming: true,
        fetchRequestStreaming: false,
        xhrUpload: true,
        workers: true,
        abortController: true,
      },
      configSource: "test",
      errors: [],
      ...(submission ? { submission } : {}),
    },
  };
}

function emptyLatency(): SpeedTestResult["latency"]["idle"] {
  return {
    meanMs: null,
    medianMs: null,
    minMs: null,
    maxMs: null,
    p95Ms: null,
    jitterMs: null,
    samples: [],
  };
}
