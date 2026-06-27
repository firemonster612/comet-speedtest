import { normalizeConfig } from "@lightspeed/config";
import { describe, expect, it } from "vitest";

import {
  aggregateLatency,
  buildWindows,
  detectCapabilities,
  finalBitsPerSecond,
  percentile,
  resolveTransports,
  runIdleLatency,
} from "../diagnostics";
import { createSpeedTest, gradeBufferbloat } from "../index";
import { LatencyCollector } from "../latency/latencyProbe";
import type {
  LatencyResult,
  LatencySample,
  RunOutcome,
  SpeedSample,
  SpeedTestResult,
} from "../results/resultTypes";
import { MeasurementRun } from "../sampling/measurementRun";
import {
  createTestSpeedTest,
  type DeterministicPhaseAdapter,
  PartialThroughputPhaseError,
  SyntheticMeasurementAdapter,
} from "../testing";
import { WorkerPool } from "../workers/workerPool";
import type { WorkerEvent } from "../workers/workerProtocol";

/** Unwrap a run we expect to succeed, failing loudly otherwise. */
function expectComplete(outcome: RunOutcome): SpeedTestResult {
  if (!outcome.ok) {
    throw new Error(`expected a complete run, got ${outcome.error.code}`);
  }
  return outcome.result;
}

function latencySample(latencyMs: number, ok: boolean): LatencySample {
  return { phase: "idle", startedAtMs: 0, endedAtMs: latencyMs, latencyMs, ok };
}

function latencyWithMedian(medianMs: number): LatencyResult {
  return {
    meanMs: medianMs,
    medianMs,
    minMs: medianMs,
    maxMs: medianMs,
    p95Ms: medianMs,
    jitterMs: null,
    samples: [],
  };
}

describe("@lightspeed/core math", () => {
  it("calculates interpolated percentiles", () => {
    expect(percentile([10, 20, 30, 40, 50], 75)).toBe(40);
    expect(percentile([10, 20], 50)).toBe(15);
  });

  it("groups samples, marks warmup, and calculates final p75", () => {
    const config = normalizeConfig({
      targets: { download: "/d", upload: "/u" },
      test: {
        sampling: {
          intervalMs: 500,
          samplesPerWindow: 6,
          measuredWindowCount: 5,
          warmupWindowCount: 1,
          percentile: 75,
        },
      },
    });
    const samples: SpeedSample[] = Array.from({ length: 36 }, (_, index) => ({
      phase: "download",
      startedAtMs: index * 500,
      endedAtMs: (index + 1) * 500,
      durationMs: 500,
      bytes: 125_000 * (index + 1),
      bitsPerSecond: 2_000_000 * (index + 1),
      warmup: index < 6,
      workerBreakdown: [{ workerId: "w", bytes: 125_000 }],
    }));

    const windows = buildWindows("download", samples, config.test.sampling);

    expect(windows).toHaveLength(6);
    expect(windows[0]?.warmup).toBe(true);
    expect(finalBitsPerSecond(windows, config.test.sampling)).toBe(55_000_000);
  });
});

describe("@lightspeed/core measurement pipeline", () => {
  const samplingFor = (overrides: Record<string, number>) =>
    normalizeConfig({
      targets: { download: "/d", upload: "/u" },
      test: { sampling: overrides },
    }).test.sampling;

  it("samples, windows, and finalizes deterministically with an injected clock", () => {
    const sampling = samplingFor({
      intervalMs: 500,
      samplesPerWindow: 2,
      measuredWindowCount: 2,
      warmupWindowCount: 1,
      percentile: 75,
    });
    let clockMs = 0;
    const run = new MeasurementRun("download", sampling, true, () => clockMs);

    for (const factor of [1, 2, 3, 4, 5, 6]) {
      clockMs += 500;
      run.record({ workerId: "w", bytes: 125_000 * factor, at: clockMs });
      const sample = run.sample();
      expect(sample.durationMs).toBe(500);
      expect(sample.bitsPerSecond).toBe(2_000_000 * factor);
    }

    const { throughput, windows, samples } = run.finish();
    expect(samples).toHaveLength(6);
    expect(windows).toHaveLength(3);
    expect(windows[0]?.warmup).toBe(true);
    expect(throughput.samples).toHaveLength(6);
    // window averages 3M (warmup), 7M, 11M -> p75 over the two measured windows.
    expect(throughput.bitsPerSecond).toBe(10_000_000);
  });

  it("does not drop samples recorded beyond the expected total", () => {
    const sampling = samplingFor({
      intervalMs: 500,
      samplesPerWindow: 2,
      measuredWindowCount: 1,
      warmupWindowCount: 0,
    });
    let clockMs = 0;
    const run = new MeasurementRun("upload", sampling, true, () => clockMs);

    for (let index = 0; index < run.totalSamples + 1; index += 1) {
      clockMs += 500;
      run.record({ workerId: "w", bytes: 100_000, at: clockMs });
      run.sample();
    }

    expect(run.finish().samples).toHaveLength(run.totalSamples + 1);
  });

  it("collects, forwards, and aggregates latency through one path", () => {
    const emitted: number[] = [];
    const collector = new LatencyCollector((sample) => emitted.push(sample.latencyMs));
    collector.record({
      phase: "download",
      startedAtMs: 0,
      endedAtMs: 10,
      latencyMs: 10,
      ok: true,
    });
    collector.record({
      phase: "download",
      startedAtMs: 0,
      endedAtMs: 30,
      latencyMs: 30,
      ok: true,
    });
    collector.record({
      phase: "download",
      startedAtMs: 0,
      endedAtMs: 0,
      latencyMs: 99,
      ok: false,
    });

    expect(emitted).toEqual([10, 30, 99]);
    expect(collector.count).toBe(3);
    const result = collector.aggregate();
    expect(result.meanMs).toBe(20);
    expect(result.samples).toHaveLength(3);
  });
});

describe("@lightspeed/core engine", () => {
  it("keeps deterministic adapters off the root options interface", () => {
    const assertRootOptionsRejectAdapters = () => {
      createSpeedTest(
        { targets: { download: "/d", upload: "/u" } },
        {
          // @ts-expect-error Adapter injection belongs to the explicit testing seam.
          measurementAdapter: new SyntheticMeasurementAdapter(),
        },
      );
    };

    expect(assertRootOptionsRejectAdapters).toBeTypeOf("function");
  });

  it("resolves upload transport branches and required browser capabilities", () => {
    const baseConfig = normalizeConfig({
      targets: { download: "/d", upload: "/u" },
    });
    const baseCapabilities = {
      fetchResponseStreaming: true,
      fetchRequestStreaming: false,
      xhrUpload: true,
      workers: true,
      abortController: true,
    };

    expect(resolveTransports(baseConfig, baseCapabilities)).toMatchObject({
      actual: { upload: "xhr-chunked" },
      fallbackReasons: [
        "auto selected xhr-chunked because fetch upload streaming is unavailable",
      ],
    });
    expect(
      resolveTransports(
        normalizeConfig({
          targets: { download: "/d", upload: "/u" },
          test: { upload: { transport: "fetch-stream", allowFallback: true } },
        }),
        baseCapabilities,
      ),
    ).toMatchObject({
      actual: { upload: "xhr-chunked" },
      fallbackReasons: ["fetch upload streaming unsupported; fell back to xhr-chunked"],
    });
    expect(() =>
      resolveTransports(baseConfig, { ...baseCapabilities, workers: false }),
    ).toThrow("Web Workers are required");
    expect(() =>
      resolveTransports(baseConfig, {
        ...baseCapabilities,
        fetchResponseStreaming: false,
      }),
    ).toThrow("Fetch response streaming is required");
    expect(
      resolveTransports(
        baseConfig,
        {
          ...baseCapabilities,
          fetchResponseStreaming: false,
        },
        { phases: ["upload"] },
      ),
    ).toMatchObject({
      actual: { download: null, upload: "xhr-chunked" },
      requested: { download: null, upload: "auto" },
    });
  });

  it("detects capabilities from mocked browser globals", () => {
    const previous = {
      ReadableStream: globalThis.ReadableStream,
      Request: globalThis.Request,
      XMLHttpRequest: globalThis.XMLHttpRequest,
      Worker: globalThis.Worker,
      AbortController: globalThis.AbortController,
      Response: globalThis.Response,
    };
    class MockRequest {
      constructor(_url: string, init?: RequestInit & { duplex?: string }) {
        if (init?.duplex !== "half") {
          throw new Error("missing duplex");
        }
      }
    }
    class MockResponse {
      body = {};
    }
    try {
      Object.assign(globalThis, {
        ReadableStream: class {},
        Request: MockRequest,
        XMLHttpRequest: class {},
        Worker: class {},
        AbortController: class {},
        Response: MockResponse,
      });

      expect(detectCapabilities()).toEqual({
        fetchResponseStreaming: true,
        fetchRequestStreaming: true,
        xhrUpload: true,
        workers: true,
        abortController: true,
      });
    } finally {
      Object.assign(globalThis, previous);
    }
  });

  it("aborts idle latency without returning failed samples", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (_input, init) =>
      new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        setTimeout(() => resolve(new Response(null, { status: 204 })), 50);
      });
    const controller = new AbortController();
    controller.abort();

    await expect(
      runIdleLatency(
        "https://speed.example.test/latency",
        {
          enabled: true,
          idleRequests: 1,
          loadedIntervalMs: 750,
          timeoutMs: 2500,
          method: "HEAD",
          reachabilityCheck: true,
        },
        () => {},
        controller.signal,
      ),
    ).rejects.toThrow("Run aborted");

    globalThis.fetch = previousFetch;
  });

  it("excludes failed latency samples from latency aggregates", () => {
    const result = aggregateLatency([
      {
        phase: "idle",
        startedAtMs: 0,
        endedAtMs: 10,
        latencyMs: 10,
        ok: true,
      },
      {
        phase: "idle",
        startedAtMs: 10,
        endedAtMs: 20,
        latencyMs: 10,
        ok: false,
      },
    ]);

    expect(result.meanMs).toBe(10);
    expect(result.samples).toHaveLength(2);
  });

  it("computes jitter as the mean absolute consecutive delta of successful samples", () => {
    // successful series [10, 30, 20] (the failed sample is skipped, order kept):
    // deltas |30-10|=20, |20-30|=10 -> mean 15.
    const result = aggregateLatency([
      latencySample(10, true),
      latencySample(30, true),
      latencySample(999, false),
      latencySample(20, true),
    ]);

    expect(result.jitterMs).toBe(15);
  });

  it("reports null jitter with fewer than two successful samples", () => {
    expect(aggregateLatency([]).jitterMs).toBeNull();
    expect(aggregateLatency([latencySample(10, true)]).jitterMs).toBeNull();
  });

  it("grades bufferbloat on the worst-direction added latency", () => {
    expect(
      gradeBufferbloat({
        idle: latencyWithMedian(20),
        underDownloadLoad: latencyWithMedian(40),
        underUploadLoad: latencyWithMedian(35),
      }),
    ).toEqual({
      idleLatencyMs: 20,
      loadedLatencyMs: 40,
      addedLatencyMs: 20,
      grade: "A",
      download: { loadedLatencyMs: 40, addedLatencyMs: 20, grade: "A" },
      upload: { loadedLatencyMs: 35, addedLatencyMs: 15, grade: "A" },
    });

    // download bloats a little (A on its own) but upload bloats a lot — each
    // direction is graded on its own added latency, and the worst sets overall.
    expect(
      gradeBufferbloat({
        idle: latencyWithMedian(10),
        underDownloadLoad: latencyWithMedian(15),
        underUploadLoad: latencyWithMedian(250),
      }),
    ).toMatchObject({
      loadedLatencyMs: 250,
      addedLatencyMs: 240,
      grade: "F",
      download: { addedLatencyMs: 5, grade: "A" },
      upload: { addedLatencyMs: 240, grade: "F" },
    });
  });

  it("returns a null bufferbloat grade when idle or loaded latency is missing", () => {
    expect(
      gradeBufferbloat({
        idle: latencyWithMedian(20),
        underDownloadLoad: null,
        underUploadLoad: null,
      }),
    ).toEqual({
      idleLatencyMs: 20,
      loadedLatencyMs: null,
      addedLatencyMs: null,
      grade: null,
      download: null,
      upload: null,
    });
  });

  it("emits phase events and returns a complete synthetic result", async () => {
    const config = normalizeConfig({
      targets: { download: "/d", upload: "/u", latency: "/l" },
      result: { includeRawSamples: true },
      test: {
        latency: { enabled: false },
        sampling: {
          intervalMs: 500,
          samplesPerWindow: 2,
          measuredWindowCount: 2,
          warmupWindowCount: 1,
        },
      },
    });
    const engine = createTestSpeedTest(config, {
      capabilities: {
        fetchResponseStreaming: true,
        fetchRequestStreaming: false,
        xhrUpload: true,
        workers: true,
        abortController: true,
      },
      measurementAdapter: new SyntheticMeasurementAdapter(),
    });
    const events: string[] = [];
    engine.on("phase-start", (event) => events.push(event.phase));
    engine.on("result", () => events.push("result"));

    const result = expectComplete(await engine.run());

    expect(events).toEqual([
      "idle-latency",
      "download",
      "upload",
      "finalize",
      "result",
    ]);
    expect(result.download?.samples).toHaveLength(6);
    expect(result.upload?.windows).toHaveLength(3);
    expect(result.diagnostics.actualTransports.upload).toBe("xhr-chunked");
    expect(result.diagnostics.measurementBasis.upload).toBe(
      "xhr upload progress events",
    );
    expect(result.latency.underDownloadLoad).toBeNull();
    // Latency is disabled in this config, so there is nothing to grade.
    expect(result.bufferbloat).toEqual({
      idleLatencyMs: null,
      loadedLatencyMs: null,
      addedLatencyMs: null,
      grade: null,
      download: null,
      upload: null,
    });
  });

  it("runs only the configured download phase", async () => {
    const engine = createTestSpeedTest(
      {
        targets: { download: "/d", upload: "/u" },
        result: { includeRawSamples: true },
        test: {
          selection: {
            phases: ["download"],
            loadedLatency: false,
          },
          latency: { enabled: false },
          sampling: {
            samplesPerWindow: 1,
            measuredWindowCount: 1,
            warmupWindowCount: 0,
          },
        },
      },
      {
        capabilities: {
          fetchResponseStreaming: true,
          fetchRequestStreaming: false,
          xhrUpload: false,
          workers: true,
          abortController: true,
        },
        measurementAdapter: new SyntheticMeasurementAdapter(),
      },
    );
    const events: string[] = [];
    engine.on("phase-start", (event) => events.push(event.phase));
    engine.on("result", () => events.push("result"));

    const result = expectComplete(await engine.run());

    expect(events).toEqual(["download", "finalize", "result"]);
    expect(result.download?.samples).toHaveLength(1);
    expect(result.upload).toBeNull();
    expect(result.latency).toEqual({
      idle: null,
      underDownloadLoad: null,
      underUploadLoad: null,
    });
    expect(result.diagnostics.testSelection).toEqual({
      phases: ["download"],
      loadedLatency: { download: false, upload: false },
    });
    expect(result.diagnostics.workersRequested).toEqual({ download: 4, upload: 0 });
  });

  it("runs upload only from a per-call selection with loaded latency disabled", async () => {
    const engine = createTestSpeedTest(
      {
        targets: { download: "/d", upload: "/u" },
        result: { includeRawSamples: true },
        test: {
          latency: { enabled: true, idleRequests: 0 },
          sampling: {
            samplesPerWindow: 1,
            measuredWindowCount: 1,
            warmupWindowCount: 0,
          },
        },
      },
      {
        capabilities: {
          fetchResponseStreaming: false,
          fetchRequestStreaming: true,
          xhrUpload: false,
          workers: true,
          abortController: true,
        },
        measurementAdapter: new SyntheticMeasurementAdapter(),
      },
    );
    const events: string[] = [];
    engine.on("phase-start", (event) => events.push(event.phase));

    const result = expectComplete(
      await engine.run({
        selection: { phases: ["upload"], loadedLatency: false },
      }),
    );

    expect(events).toEqual(["upload", "finalize"]);
    expect(result.download).toBeNull();
    expect(result.upload?.samples).toHaveLength(1);
    expect(result.latency.idle).toBeNull();
    expect(result.latency.underUploadLoad).toBeNull();
    expect(result.diagnostics.actualTransports).toEqual({
      download: null,
      upload: "fetch-stream",
    });
  });

  it("rejects invalid per-call run selections", async () => {
    const engine = createTestSpeedTest(
      { targets: { download: "/d", upload: "/u" } },
      {
        capabilities: {
          fetchResponseStreaming: true,
          fetchRequestStreaming: true,
          xhrUpload: true,
          workers: true,
          abortController: true,
        },
        measurementAdapter: new SyntheticMeasurementAdapter(),
      },
    );

    const outcome = await engine.run({ selection: { phases: [] } });

    expect(outcome.ok).toBe(false);
    expect(outcome).toMatchObject({
      ok: false,
      error: {
        code: "config-invalid",
        message: expect.stringContaining("test.selection.phases"),
      },
      partial: null,
    });
  });

  it("fails explicit unsupported upload transport without fallback", async () => {
    const engine = createTestSpeedTest(
      {
        targets: { download: "/d", upload: "/u" },
        test: {
          upload: {
            transport: "fetch-stream",
            allowFallback: false,
          },
        },
      },
      {
        capabilities: {
          fetchResponseStreaming: true,
          fetchRequestStreaming: false,
          xhrUpload: true,
          workers: true,
          abortController: true,
        },
        measurementAdapter: new SyntheticMeasurementAdapter(),
      },
    );

    const outcome = await engine.run();

    expect(outcome).toMatchObject({
      ok: false,
      error: { code: "transport-unsupported" },
    });
  });

  it("reports upload phase failures with an upload-specific error code", async () => {
    const failingUploadAdapter: DeterministicPhaseAdapter = {
      async runPhase(options) {
        if (options.phase === "upload") {
          throw new Error("upload endpoint rejected the body");
        }
        return new SyntheticMeasurementAdapter().runPhase(options);
      },
    };
    const engine = createTestSpeedTest(
      {
        targets: { download: "/d", upload: "/u" },
        test: {
          latency: { enabled: false },
          sampling: {
            samplesPerWindow: 1,
            measuredWindowCount: 1,
            warmupWindowCount: 0,
          },
        },
      },
      {
        capabilities: {
          fetchResponseStreaming: true,
          fetchRequestStreaming: true,
          xhrUpload: true,
          workers: true,
          abortController: true,
        },
        measurementAdapter: failingUploadAdapter,
      },
    );

    const outcome = await engine.run();

    expect(outcome).toMatchObject({
      ok: false,
      error: { code: "upload-failed", phase: "upload" },
    });
  });

  it("falls back to xhr upload when fetch-stream upload fails at runtime", async () => {
    let uploadAttempts = 0;
    const runtimeFallbackAdapter: DeterministicPhaseAdapter = {
      async runPhase(options) {
        if (options.phase === "upload") {
          uploadAttempts += 1;
          if (uploadAttempts === 1) {
            throw new Error("fetch upload streaming requires HTTP/2");
          }
        }
        return new SyntheticMeasurementAdapter().runPhase(options);
      },
    };
    const engine = createTestSpeedTest(
      {
        targets: { download: "/d", upload: "/u" },
        test: {
          latency: { enabled: false },
          upload: {
            transport: "auto",
            allowFallback: true,
          },
          sampling: {
            samplesPerWindow: 1,
            measuredWindowCount: 1,
            warmupWindowCount: 0,
          },
        },
      },
      {
        capabilities: {
          fetchResponseStreaming: true,
          fetchRequestStreaming: true,
          xhrUpload: true,
          workers: true,
          abortController: true,
        },
        measurementAdapter: runtimeFallbackAdapter,
      },
    );

    const result = expectComplete(await engine.run());

    expect(uploadAttempts).toBe(2);
    expect(result.diagnostics.actualTransports.upload).toBe("xhr-chunked");
    expect(result.diagnostics.fallbackReasons).toContain(
      "fetch upload streaming failed at runtime; fell back to xhr-chunked",
    );
  });

  it("preserves completed phase diagnostics on a stopped partial run", async () => {
    const adapter: DeterministicPhaseAdapter = {
      async runPhase(options) {
        if (options.phase === "download") {
          return new SyntheticMeasurementAdapter().runPhase(options);
        }
        await new Promise((_resolve, reject) => {
          if (options.signal.aborted) {
            reject(new Error("Run aborted"));
            return;
          }
          options.signal.addEventListener(
            "abort",
            () => reject(new Error("Run aborted")),
            { once: true },
          );
        });
        throw new Error("unreachable");
      },
    };
    const engine = createTestSpeedTest(
      {
        targets: { download: "/d", upload: "/u" },
        test: {
          latency: { enabled: false },
          sampling: {
            samplesPerWindow: 1,
            measuredWindowCount: 1,
            warmupWindowCount: 0,
          },
        },
      },
      {
        capabilities: {
          fetchResponseStreaming: true,
          fetchRequestStreaming: true,
          xhrUpload: true,
          workers: true,
          abortController: true,
        },
        measurementAdapter: adapter,
      },
    );
    engine.on("phase-start", (event) => {
      if (event.phase === "upload") {
        engine.stop();
      }
    });

    const outcome = await engine.run();

    expect(outcome).toMatchObject({
      ok: false,
      error: { code: "aborted", phase: "upload" },
      partial: {
        completedPhases: {
          download: expect.objectContaining({
            bitsPerSecond: expect.any(Number) as number,
          }),
        },
      },
    });
  });

  it("preserves in-flight phase samples on an aborted partial run", async () => {
    const partialUpload = {
      throughput: {
        bitsPerSecond: 12_000_000,
        bytesTransferred: 1_500_000,
        durationMs: 1000,
        percentile: 75,
        sampleIntervalMs: 500,
        samplesPerWindow: 1,
        measuredWindowCount: 1,
        warmupWindowCount: 0,
        windows: [
          {
            phase: "upload" as const,
            index: 0,
            sampleCount: 1,
            startedAtMs: 0,
            endedAtMs: 500,
            averageBitsPerSecond: 12_000_000,
            sampleIndexes: [0],
            warmup: false,
          },
        ],
        samples: [
          {
            phase: "upload" as const,
            startedAtMs: 0,
            endedAtMs: 500,
            durationMs: 500,
            bytes: 750_000,
            bitsPerSecond: 12_000_000,
            warmup: false,
            workerBreakdown: [{ workerId: "upload-0", bytes: 750_000 }],
          },
        ],
      },
      loadedLatency: aggregateLatency([]),
      workersStarted: 1,
      workerErrors: [],
    };
    const adapter: DeterministicPhaseAdapter = {
      async runPhase(options) {
        if (options.phase === "upload") {
          throw new PartialThroughputPhaseError("Run aborted", partialUpload);
        }
        return new SyntheticMeasurementAdapter().runPhase(options);
      },
    };
    const engine = createTestSpeedTest(
      {
        targets: { download: "/d", upload: "/u" },
        result: { includeRawSamples: true },
        test: {
          latency: { enabled: false },
          sampling: {
            samplesPerWindow: 1,
            measuredWindowCount: 1,
            warmupWindowCount: 0,
          },
        },
      },
      {
        capabilities: {
          fetchResponseStreaming: true,
          fetchRequestStreaming: true,
          xhrUpload: true,
          workers: true,
          abortController: true,
        },
        measurementAdapter: adapter,
      },
    );
    engine.on("phase-start", (event) => {
      if (event.phase === "upload") {
        engine.stop();
      }
    });

    const outcome = await engine.run();

    expect(outcome).toMatchObject({
      ok: false,
      error: { code: "aborted", phase: "upload" },
      partial: {
        diagnostics: {
          workersStarted: { upload: 1 },
        },
        completedPhases: {
          upload: expect.objectContaining({
            bitsPerSecond: 12_000_000,
            samples: expect.arrayContaining([
              expect.objectContaining({ bytes: 750_000 }),
            ]) as unknown[],
          }),
        },
      },
    });
  });

  it("forwards worker events and posts stop before terminating workers", async () => {
    const events: WorkerEvent[] = [];
    const pool = new WorkerPool((event) => events.push(event));
    const worker = new FakeWorker();

    pool.start("download-0", worker as unknown as Worker, {
      type: "start-download",
      job: {
        workerId: "download-0",
        target: "https://speed.example.test/download.bin",
        runId: "run-1",
      },
    });
    worker.emit({
      type: "bytes",
      workerId: "download-0",
      phase: "download",
      bytes: 1024,
      at: 10,
    });
    pool.stop("done");

    expect(events).toEqual([
      {
        type: "bytes",
        workerId: "download-0",
        phase: "download",
        bytes: 1024,
        at: 10,
      },
    ]);
    expect(worker.messages.at(-1)).toEqual({ type: "stop", reason: "done" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(worker.terminated).toBe(true);
    expect(pool.size()).toBe(0);
  });
});

class FakeWorker {
  onmessage: ((message: MessageEvent<WorkerEvent>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly messages: unknown[] = [];
  terminated = false;

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(event: WorkerEvent): void {
    this.onmessage?.({ data: event } as MessageEvent<WorkerEvent>);
  }
}
