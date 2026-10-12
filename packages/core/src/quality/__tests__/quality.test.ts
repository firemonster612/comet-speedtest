import { describe, expect, it } from "vitest";

import type { SpeedTestResult } from "../../results/resultTypes";
import { scoreConnectionQuality } from "../scoreConnectionQuality";

function result(overrides: Partial<SpeedTestResult> = {}): SpeedTestResult {
  return {
    runId: "run-1",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:05.000Z",
    configHash: "abc123",
    download: throughput(250),
    upload: throughput(50),
    latency: {
      idle: latency(18, 3),
      underDownloadLoad: latency(45, 6),
      underUploadLoad: latency(40, 5),
    },
    bufferbloat: {
      idleLatencyMs: 18,
      loadedLatencyMs: 45,
      addedLatencyMs: 27,
      grade: "A",
      download: { loadedLatencyMs: 45, addedLatencyMs: 27, grade: "A" },
      upload: { loadedLatencyMs: 40, addedLatencyMs: 22, grade: "A" },
    },
    diagnostics: {
      userAgent: "test",
      testSelection: {
        phases: ["idle-latency", "download", "upload"],
        loadedLatency: { download: true, upload: true },
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
    ...overrides,
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

function latency(medianMs: number, jitterMs: number) {
  return {
    meanMs: medianMs,
    medianMs,
    minMs: medianMs,
    maxMs: medianMs,
    p95Ms: medianMs,
    jitterMs,
    samples: [],
  };
}

describe("scoreConnectionQuality", () => {
  it("scores complete strong results and exposes audited inputs", () => {
    const quality = scoreConnectionQuality(result());

    expect(quality.schemaVersion).toBe("comet-quality/v1");
    expect(quality.inputs).toMatchObject({
      downloadMbps: 250,
      uploadMbps: 50,
      idleLatencyMs: 18,
      loadedLatencyMs: 45,
      addedLatencyMs: 27,
      jitterMs: 6,
      bufferbloatGrade: "A",
    });
    expect(quality.overall.grade).toBe("excellent");
    expect(quality.webBrowsing.grade).toBe("excellent");
    expect(quality.gaming.limitingFactors).toEqual([]);
  });

  it("marks latency and jitter as limiting factors for interactive use", () => {
    const quality = scoreConnectionQuality(
      result({
        latency: {
          idle: latency(140, 75),
          underDownloadLoad: latency(320, 90),
          underUploadLoad: latency(260, 80),
        },
        bufferbloat: {
          idleLatencyMs: 140,
          loadedLatencyMs: 320,
          addedLatencyMs: 180,
          grade: "D",
          download: { loadedLatencyMs: 320, addedLatencyMs: 180, grade: "D" },
          upload: { loadedLatencyMs: 260, addedLatencyMs: 120, grade: "C" },
        },
      }),
    );

    expect(quality.gaming.grade).toBe("poor");
    expect(quality.gaming.limitingFactors).toEqual(
      expect.arrayContaining(["loaded-latency", "jitter"]),
    );
    expect(quality.webBrowsing.limitingFactors).toEqual(
      expect.arrayContaining(["loaded-latency"]),
    );
  });

  it("returns unknown scores when required inputs are missing", () => {
    const quality = scoreConnectionQuality(
      result({
        download: null,
        upload: null,
        latency: { idle: null, underDownloadLoad: null, underUploadLoad: null },
        bufferbloat: {
          idleLatencyMs: null,
          loadedLatencyMs: null,
          addedLatencyMs: null,
          grade: null,
          download: null,
          upload: null,
        },
      }),
    );

    expect(quality.overall.grade).toBe("unknown");
    expect(quality.webBrowsing.score).toBeNull();
    expect(quality.streaming.score).toBeNull();
  });

  it("scores loaded latency without the idle-latency phase", () => {
    const quality = scoreConnectionQuality(
      result({
        latency: {
          idle: null,
          underDownloadLoad: latency(45, 6),
          underUploadLoad: latency(40, 5),
        },
        bufferbloat: {
          idleLatencyMs: null,
          loadedLatencyMs: null,
          addedLatencyMs: null,
          grade: null,
          download: null,
          upload: null,
        },
      }),
    );

    expect(quality.inputs).toMatchObject({
      idleLatencyMs: null,
      loadedLatencyMs: 45,
      jitterMs: 6,
      addedLatencyMs: null,
    });
    expect(quality.streaming.grade).toBe("excellent");
    expect(quality.videoCalling.grade).toBe("excellent");
    expect(quality.webBrowsing.explanation).toBe(
      "Web browsing quality is unknown because the run did not produce: idle latency, bufferbloat.",
    );
  });

  it("does not score an activity from a subset of its inputs", () => {
    const quality = scoreConnectionQuality(
      result({
        download: throughput(1000),
        upload: null,
        latency: { idle: null, underDownloadLoad: null, underUploadLoad: null },
        bufferbloat: {
          idleLatencyMs: null,
          loadedLatencyMs: null,
          addedLatencyMs: null,
          grade: null,
          download: null,
          upload: null,
        },
      }),
    );

    for (const activity of [
      quality.overall,
      quality.webBrowsing,
      quality.gaming,
      quality.streaming,
      quality.videoCalling,
    ]) {
      expect(activity).toMatchObject({
        score: null,
        grade: "unknown",
        limitingFactors: [],
      });
    }
    expect(quality.gaming.explanation).toBe(
      "Gaming quality is unknown because the run did not produce: idle latency, loaded latency, jitter, upload speed, bufferbloat.",
    );
    expect(quality.overall.explanation).toBe(
      "Overall quality is unknown because the run did not produce: web browsing, gaming, streaming, video calling.",
    );
  });
});
