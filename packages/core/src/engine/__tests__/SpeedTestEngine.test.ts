import type { RuntimeConfig } from "@comet-speedtest/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { probeReachability } from "../../latency/latencyProbe";
import { gradeBufferbloat } from "../../results/bufferbloat";
import type { SpeedTestEvent, SpeedTestState } from "../../results/resultTypes";
import {
  createTestSpeedTest,
  type DeterministicPhaseAdapter,
  SyntheticMeasurementAdapter,
} from "../../testing";
import type { WorkerCommand, WorkerEvent } from "../../workers/workerProtocol";

vi.mock("../../latency/latencyProbe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../latency/latencyProbe")>();
  return { ...actual, probeReachability: vi.fn(actual.probeReachability) };
});
vi.mock("../../results/bufferbloat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../results/bufferbloat")>();
  return { ...actual, gradeBufferbloat: vi.fn(actual.gradeBufferbloat) };
});

const capabilities = {
  fetchResponseStreaming: true,
  fetchRequestStreaming: true,
  xhrUpload: true,
  workers: true,
  abortController: true,
};

const config: RuntimeConfig = {
  targets: { download: "/d", upload: "/u", latency: "/l" },
  test: {
    latency: { enabled: false },
    upload: { transport: "auto", allowFallback: true },
    sampling: { samplesPerWindow: 1, measuredWindowCount: 1, warmupWindowCount: 0 },
  },
};

const synthetic = new SyntheticMeasurementAdapter();

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("Run aborted")), {
      once: true,
    });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SpeedTestEngine lifecycle", () => {
  it("keeps a run started from a result listener stoppable", async () => {
    let runs = 0;
    const adapter: DeterministicPhaseAdapter = {
      runIdleLatency: (options) => synthetic.runIdleLatency(options),
      runPhase(options) {
        return runs === 1 ? synthetic.runPhase(options) : rejectOnAbort(options.signal);
      },
    };
    const engine = createTestSpeedTest(config, {
      capabilities,
      measurementAdapter: adapter,
    });
    engine.on("start", () => {
      runs += 1;
    });
    let secondRun: ReturnType<typeof engine.run> | undefined;
    const unsubscribe = engine.on("result", () => {
      unsubscribe();
      secondRun = engine.run();
    });

    await engine.run();
    engine.stop();

    await expect(secondRun).resolves.toMatchObject({
      ok: false,
      error: { code: "aborted" },
    });
  });

  it("doesn't deliver the current event to a listener added during its dispatch", async () => {
    const engine = createTestSpeedTest(config, {
      capabilities,
      measurementAdapter: synthetic,
    });
    const nextRunIds: string[] = [];
    let secondRun: ReturnType<typeof engine.run> | undefined;
    const unsubscribe = engine.on("result", () => {
      unsubscribe();
      engine.on("result", (event) => nextRunIds.push(event.result.runId));
      secondRun = engine.run();
    });

    await engine.run();
    const second = await secondRun;

    expect(second?.ok).toBe(true);
    expect(nextRunIds).toEqual([second?.ok ? second.result.runId : null]);
  });

  it("skips a listener removed earlier in the same dispatch", async () => {
    const engine = createTestSpeedTest(config, {
      capabilities,
      measurementAdapter: synthetic,
    });
    const calls: string[] = [];
    engine.on("start", () => {
      calls.push("A");
      unsubscribeB();
    });
    const unsubscribeB = engine.on("start", () => {
      calls.push("B");
      engine.stop();
    });

    const outcome = await engine.run();

    expect(calls).toEqual(["A"]);
    expect(outcome.ok).toBe(true);
  });

  it("skips a listener removed and re-added earlier in the same dispatch", async () => {
    const engine = createTestSpeedTest(config, {
      capabilities,
      measurementAdapter: synthetic,
    });
    const calls: string[] = [];
    const listenerB = (): void => {
      calls.push("B");
      engine.stop();
    };
    engine.on("start", () => {
      calls.push("A");
      unsubscribeB();
      engine.on("start", listenerB);
    });
    const unsubscribeB = engine.on("start", listenerB);

    const outcome = await engine.run();

    expect(calls).toEqual(["A"]);
    expect(outcome.ok).toBe(true);
  });

  it("leaves a run started from a result listener alone when a later listener throws", async () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const listenerBug = new Error("listener bug");
    let runs = 0;
    const adapter: DeterministicPhaseAdapter = {
      runIdleLatency: (options) => synthetic.runIdleLatency(options),
      runPhase(options) {
        return runs === 1 ? synthetic.runPhase(options) : rejectOnAbort(options.signal);
      },
    };
    const engine = createTestSpeedTest(config, {
      capabilities,
      measurementAdapter: adapter,
    });
    engine.on("start", () => {
      runs += 1;
    });
    let secondRun: ReturnType<typeof engine.run> | undefined;
    engine.on("result", () => {
      secondRun = engine.run();
    });
    engine.on("result", () => {
      throw listenerBug;
    });
    const errors: string[] = [];
    engine.on("error", (event) => errors.push(event.error.code));

    const firstRun = await engine.run();

    expect(firstRun.ok).toBe(true);
    expect(reportError).toHaveBeenCalledWith(listenerBug);
    expect(engine.getState().status).toBe("running");
    expect(errors).toEqual([]);
    await expect(engine.run()).rejects.toMatchObject({
      message: "A speed test run is already active.",
    });
    engine.stop();
    await expect(secondRun).resolves.toMatchObject({
      ok: false,
      error: { code: "aborted" },
    });
    expect(errors).toEqual(["aborted"]);
  });

  const failingAdapter: DeterministicPhaseAdapter = {
    runIdleLatency: (options) => synthetic.runIdleLatency(options),
    runPhase: () => Promise.reject(new Error("HTTP 500")),
  };
  it.each([
    ["result", synthetic, true, "complete"],
    ["error", failingAdapter, false, "error"],
  ] as const)(
    "keeps the outcome when a listener for %s throws",
    async (eventType, adapter, ok, status) => {
      const reportError = vi.fn();
      vi.stubGlobal("reportError", reportError);
      const listenerBug = new Error("listener bug");
      const engine = createTestSpeedTest(config, {
        capabilities,
        measurementAdapter: adapter,
      });
      const delivered: string[] = [];
      engine.on(eventType, () => {
        throw listenerBug;
      });
      engine.on(eventType, () => delivered.push(eventType));

      const outcome = await engine.run();

      expect(outcome.ok).toBe(ok);
      expect(engine.getState().status).toBe(status);
      expect(delivered).toEqual([eventType]);
      expect(reportError).toHaveBeenCalledWith(listenerBug);
    },
  );

  it("ends as aborted when stopped from the last phase-complete listener", async () => {
    const engine = createTestSpeedTest(config, {
      capabilities,
      measurementAdapter: synthetic,
    });
    engine.on("phase-complete", (event) => {
      if (event.phase === "upload") {
        engine.stop();
      }
    });
    const events: string[] = [];
    engine.on("result", () => events.push("result"));

    const outcome = await engine.run();

    expect(outcome).toMatchObject({
      ok: false,
      error: { code: "aborted" },
      partial: {
        completedPhases: {
          download: expect.objectContaining({ bitsPerSecond: expect.any(Number) }),
          upload: expect.objectContaining({ bitsPerSecond: expect.any(Number) }),
        },
      },
    });
    expect(events).toEqual([]);
    expect(engine.getState().status).toBe("aborted");
  });

  it("reports an untyped failure before any phase as internal-error", async () => {
    // Without an injected adapter the engine only skips the reachability gate
    // when Worker is missing; the gate fails before any worker is created.
    vi.stubGlobal("Worker", class {});
    vi.mocked(probeReachability).mockRejectedValueOnce(new Error("probe bug"));
    const engine = createTestSpeedTest(config, { capabilities });

    const outcome = await engine.run();

    expect(outcome).toMatchObject({
      ok: false,
      error: { code: "internal-error", message: "probe bug" },
    });
    expect(outcome.ok ? undefined : outcome.error.phase).toBeUndefined();
  });

  it("reports an untyped failure during finalize as internal-error", async () => {
    vi.mocked(gradeBufferbloat).mockImplementationOnce(() => {
      throw new Error("grading bug");
    });
    const engine = createTestSpeedTest(config, {
      capabilities,
      measurementAdapter: synthetic,
    });

    const outcome = await engine.run();

    expect(outcome).toMatchObject({
      ok: false,
      error: { code: "internal-error", message: "grading bug", phase: "finalize" },
    });
  });
});

describe("SpeedTestEngine runtime upload fallback", () => {
  const strayLatencyMs = 999;
  const strayBitsPerSecond = 1;

  /** Fetch-stream upload emits some events, then fails the way Chrome does on HTTP/1.1. */
  function failFirstUploadAdapter(): DeterministicPhaseAdapter & {
    uploadCalls: number;
  } {
    return {
      uploadCalls: 0,
      runIdleLatency: (options) => synthetic.runIdleLatency(options),
      async runPhase(options) {
        if (options.phase !== "upload" || ++this.uploadCalls > 1) {
          return synthetic.runPhase(options);
        }
        options.emit.sample({
          phase: "upload",
          startedAtMs: 0,
          endedAtMs: 100,
          durationMs: 100,
          bytes: 1,
          bitsPerSecond: strayBitsPerSecond,
          warmup: false,
          workerBreakdown: [],
        });
        options.emit.latency({
          phase: "upload",
          startedAtMs: 0,
          endedAtMs: strayLatencyMs,
          latencyMs: strayLatencyMs,
          ok: true,
        });
        throw new Error("fetch upload streaming requires HTTP/2");
      },
    };
  }

  it("emits phase-reset and clears the failed attempt from engine state", async () => {
    const adapter = failFirstUploadAdapter();
    const engine = createTestSpeedTest(config, {
      capabilities,
      measurementAdapter: adapter,
    });
    const events: SpeedTestEvent["type"][] = [];
    for (const type of [
      "phase-start",
      "sample",
      "phase-reset",
      "phase-complete",
    ] as const) {
      engine.on(type, (event) => events.push(event.type));
    }
    let reset: Extract<SpeedTestEvent, { type: "phase-reset" }> | undefined;
    let stateAtReset: SpeedTestState | undefined;
    engine.on("phase-reset", (event) => {
      reset = event;
      stateAtReset = engine.getState();
    });

    const outcome = await engine.run();

    expect(outcome.ok).toBe(true);
    expect(reset).toEqual({
      type: "phase-reset",
      phase: "upload",
      reason: expect.stringContaining("fetch upload streaming requires HTTP/2"),
    });
    const resetIndex = events.indexOf("phase-reset");
    expect(events.slice(resetIndex - 2, resetIndex + 1)).toEqual([
      "phase-start",
      "sample",
      "phase-reset",
    ]);
    expect(stateAtReset?.latestSample?.bitsPerSecond).not.toBe(strayBitsPerSecond);
    expect(stateAtReset?.latestLatencySample?.latencyMs).not.toBe(strayLatencyMs);
  });

  it("does not fall back when a sample listener throws during the fetch-stream attempt", async () => {
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const listenerBug = new Error("consumer chart bug");
    let uploadCalls = 0;
    const adapter: DeterministicPhaseAdapter = {
      runIdleLatency: (options) => synthetic.runIdleLatency(options),
      runPhase(options) {
        uploadCalls += options.phase === "upload" ? 1 : 0;
        return synthetic.runPhase(options);
      },
    };
    const engine = createTestSpeedTest(config, {
      capabilities,
      measurementAdapter: adapter,
    });
    const unsubscribe = engine.on("sample", (event) => {
      if (event.sample.phase === "upload") {
        unsubscribe();
        throw listenerBug;
      }
    });
    const resets: unknown[] = [];
    engine.on("phase-reset", (event) => resets.push(event));
    const onFetchStream = {
      ok: true,
      result: {
        diagnostics: {
          actualTransports: { upload: "fetch-stream" },
          fallbackReasons: [],
        },
      },
    };

    const first = await engine.run();
    const second = await engine.run();

    expect(reportError).toHaveBeenCalledWith(listenerBug);
    expect(resets).toEqual([]);
    expect(uploadCalls).toBe(2);
    expect(first).toMatchObject(onFetchStream);
    expect(second).toMatchObject(onFetchStream);
  });

  it("keeps trying fetch-stream upload after a run where the xhr-chunked retry failed too", async () => {
    let uploadCalls = 0;
    const adapter: DeterministicPhaseAdapter = {
      runIdleLatency: (options) => synthetic.runIdleLatency(options),
      runPhase(options) {
        if (options.phase === "upload" && ++uploadCalls <= 2) {
          return Promise.reject(new Error("upload-0: Upload failed with HTTP 503"));
        }
        return synthetic.runPhase(options);
      },
    };
    const engine = createTestSpeedTest(config, {
      capabilities,
      measurementAdapter: adapter,
    });

    const failed = await engine.run();
    const outcome = await engine.run();

    expect(failed.ok).toBe(false);
    expect(uploadCalls).toBe(3);
    expect(outcome).toMatchObject({
      ok: true,
      result: {
        diagnostics: {
          actualTransports: { upload: "fetch-stream" },
          fallbackReasons: [],
        },
      },
    });
  });

  it("skips fetch-stream upload on later runs after a runtime failure", async () => {
    const adapter = failFirstUploadAdapter();
    const engine = createTestSpeedTest(config, {
      capabilities,
      measurementAdapter: adapter,
    });
    await engine.run();
    const resets: unknown[] = [];
    engine.on("phase-reset", (event) => resets.push(event));

    const outcome = await engine.run();

    expect(adapter.uploadCalls).toBe(3);
    expect(resets).toEqual([]);
    expect(outcome).toMatchObject({
      ok: true,
      result: {
        diagnostics: {
          requestedTransports: { upload: "auto" },
          actualTransports: { upload: "xhr-chunked" },
          measurementBasis: { upload: "xhr upload progress events" },
          fallbackReasons: [
            expect.stringMatching(
              /earlier run.*fetch upload streaming requires HTTP\/2/,
            ),
          ],
        },
      },
    });
  });
});

describe("SpeedTestEngine worker phases", () => {
  const liveLatencyMs = 10;
  const staleLatencyMs = 999;

  /**
   * Fetch-stream upload workers fail at once; xhr-chunked ones transfer. Every
   * loaded-latency worker has one more probe result queued when it is stopped.
   */
  class FakeWorker {
    onmessage: ((message: MessageEvent<WorkerEvent>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    private readonly workerId: string;
    private readonly streamingUpload: boolean;
    private timer: ReturnType<typeof setInterval> | undefined;

    constructor(url: URL, options: WorkerOptions) {
      this.workerId = options.name ?? "";
      this.streamingUpload = url.href.includes("fetchStreamUploadWorker");
    }

    postMessage(command: WorkerCommand): void {
      const { workerId } = this;
      switch (command.type) {
        case "stop":
          clearInterval(this.timer);
          if (workerId === "upload-latency") {
            setTimeout(() => this.post(this.latency(staleLatencyMs)), 0);
          }
          return;
        case "start-loaded-latency":
          this.timer = setInterval(() => this.post(this.latency(liveLatencyMs)), 10);
          return;
        case "start-upload":
          this.post({ type: "ready", workerId });
          if (this.streamingUpload) {
            this.post({
              type: "error",
              workerId,
              error: { message: "fetch upload streaming requires HTTP/2" },
            });
            return;
          }
          this.timer = setInterval(() => {
            this.post({
              type: "bytes",
              workerId,
              phase: "upload",
              bytes: 100_000,
              at: performance.now(),
            });
          }, 10);
          return;
        case "start-download":
          throw new Error("not used");
      }
    }

    terminate(): void {
      clearInterval(this.timer);
    }

    private latency(latencyMs: number): WorkerEvent {
      return {
        type: "latency",
        workerId: this.workerId,
        phase: "upload",
        latencyMs,
        at: 0,
        ok: true,
      };
    }

    private post(event: WorkerEvent): void {
      this.onmessage?.({ data: event } as MessageEvent<WorkerEvent>);
    }
  }

  it("reports a throwing latency-sample listener without affecting the run", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const listenerBug = new Error("consumer latency bug");
    const engine = createTestSpeedTest(
      {
        ...config,
        test: {
          ...config.test,
          latency: { enabled: true, reachabilityCheck: false },
          upload: { transport: "xhr-chunked", workers: 1 },
          sampling: {
            intervalMs: 100,
            samplesPerWindow: 1,
            measuredWindowCount: 1,
            warmupWindowCount: 0,
          },
        },
      },
      { capabilities },
    );
    engine.on("latency-sample", () => {
      throw listenerBug;
    });

    const outcome = await engine.run({
      selection: { phases: ["upload"], loadedLatency: true },
    });

    expect(reportError).toHaveBeenCalledWith(listenerBug);
    expect(outcome).toMatchObject({
      ok: true,
      result: { latency: { underUploadLoad: { medianMs: liveLatencyMs } } },
    });
  });

  it("drops messages a stopped upload attempt had queued", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const engine = createTestSpeedTest(
      {
        ...config,
        test: {
          ...config.test,
          latency: { enabled: true, reachabilityCheck: false },
          upload: { transport: "auto", allowFallback: true, workers: 1 },
          sampling: {
            intervalMs: 100,
            samplesPerWindow: 1,
            measuredWindowCount: 1,
            warmupWindowCount: 0,
          },
        },
      },
      { capabilities },
    );
    const latencies: (number | "reset")[] = [];
    engine.on("latency-sample", (event) => latencies.push(event.sample.latencyMs));
    engine.on("phase-reset", () => latencies.push("reset"));

    const outcome = await engine.run({
      selection: { phases: ["upload"], loadedLatency: true },
    });
    // Let the retry's own stopped workers deliver their queued messages too.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(outcome.ok).toBe(true);
    expect(latencies).toContain("reset");
    expect(latencies.slice(latencies.indexOf("reset") + 1)).not.toContain(
      staleLatencyMs,
    );
    expect(engine.getState().latestLatencySample?.latencyMs).toBe(liveLatencyMs);
  });
});
