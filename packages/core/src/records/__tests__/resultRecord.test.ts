import { describe, expect, it } from "vitest";

import type {
  LatencyResult,
  LatencySample,
  SpeedTestResult,
} from "../../results/resultTypes";
import { createResultRecord } from "../createResultRecord";

function result(): SpeedTestResult {
  return {
    runId: "run-1",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:05.000Z",
    configHash: "abc123",
    download: throughput("download"),
    upload: throughput("upload"),
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

function throughput(phase: "download" | "upload") {
  return {
    bitsPerSecond: 10_000_000,
    bytesTransferred: 1,
    durationMs: 1,
    percentile: 75,
    sampleIntervalMs: 100,
    samplesPerWindow: 1,
    measuredWindowCount: 1,
    warmupWindowCount: 0,
    samples: [
      {
        phase,
        startedAtMs: 0,
        endedAtMs: 100,
        durationMs: 100,
        bytes: 1,
        bitsPerSecond: 10_000_000,
        warmup: false,
        workerBreakdown: [],
      },
    ],
    windows: [],
  };
}

function latency(sample: LatencySample): LatencyResult {
  return {
    meanMs: 20,
    medianMs: 20,
    minMs: 20,
    maxMs: 20,
    p95Ms: 20,
    jitterMs: null,
    samples: [sample],
  };
}

describe("createResultRecord", () => {
  it("wraps results with versioning, target metadata, and context", () => {
    const record = createResultRecord(result(), {
      createdAt: "2026-01-01T00:00:10.000Z",
      selectedTarget: { id: "dal", label: "Dallas" },
      context: { accountId: "acct-1" },
      rawSamples: "preserve",
    });

    expect(record).toMatchObject({
      schemaVersion: "comet-result-record/v1",
      createdAt: "2026-01-01T00:00:10.000Z",
      selectedTarget: { id: "dal", label: "Dallas" },
      context: { accountId: "acct-1" },
      privacy: { rawSamples: "included" },
      result: { runId: "run-1" },
    });
  });

  it("strips raw samples without mutating the original result", () => {
    const original = result();
    const record = createResultRecord(original, { rawSamples: "strip" });

    expect(record.privacy.rawSamples).toBe("stripped");
    expect(record.result.download?.samples).toBeUndefined();
    expect(record.result.upload?.windows).toBeUndefined();
    expect(original.download?.samples).toHaveLength(1);
    expect(original.upload?.windows).toEqual([]);
  });

  it("strips latency samples and counts them as raw samples", () => {
    const sample = { startedAtMs: 0, endedAtMs: 20, latencyMs: 20, ok: true };
    const withLatency: SpeedTestResult = {
      ...result(),
      download: { ...throughput("download"), samples: [] },
      upload: null,
      latency: {
        idle: latency({ ...sample, phase: "idle" }),
        underDownloadLoad: latency({ ...sample, phase: "download" }),
        underUploadLoad: null,
      },
    };

    expect(createResultRecord(withLatency).privacy.rawSamples).toBe("included");
    const stripped = createResultRecord(withLatency, { rawSamples: "strip" }).result;
    expect(stripped.latency.idle).toMatchObject({ medianMs: 20, samples: [] });
    expect(stripped.latency.underDownloadLoad?.samples).toEqual([]);
    expect(stripped.latency.underUploadLoad).toBeNull();
    expect(withLatency.latency.idle?.samples).toHaveLength(1);
  });
});
