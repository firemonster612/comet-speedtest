import type {
  NormalizedSamplingConfig,
  NormalizedSpeedTestConfig,
} from "@comet-speedtest/config";

import { LatencyCollector } from "../latency/latencyProbe";
import type {
  LatencyResult,
  LatencySample,
  SpeedSample,
  SpeedTestError,
  SpeedWindow,
  ThroughputPhase,
  ThroughputResult,
} from "../results/resultTypes";
import { MeasurementRun } from "../sampling/measurementRun";
import { abortableDelay } from "../shared/abortSignals";
import { WorkerPool } from "../workers/workerPool";
import type { WorkerEvent } from "../workers/workerProtocol";
import { nowMs } from "./lifecycle";

export interface ThroughputPhaseResult {
  throughput: ThroughputResult;
  loadedLatency: LatencyResult | null;
  workersStarted: number;
  workerErrors: SpeedTestError[];
}

export class PartialThroughputPhaseError extends Error {
  readonly partialPhaseResult: ThroughputPhaseResult;

  constructor(message: string, partialPhaseResult: ThroughputPhaseResult) {
    super(message);
    this.name = "PartialThroughputPhaseError";
    this.partialPhaseResult = partialPhaseResult;
  }
}

export interface PhaseEventSink {
  sample: (sample: SpeedSample) => void;
  window: (window: SpeedWindow) => void;
  latency: (sample: LatencySample) => void;
}

export interface DeterministicPhaseAdapter {
  runPhase(options: {
    phase: ThroughputPhase;
    config: NormalizedSpeedTestConfig;
    signal: AbortSignal;
    loadedLatency: boolean;
    emit: PhaseEventSink;
  }): Promise<ThroughputPhaseResult>;
}

export class SyntheticMeasurementAdapter implements DeterministicPhaseAdapter {
  async runPhase(options: {
    phase: ThroughputPhase;
    config: NormalizedSpeedTestConfig;
    signal: AbortSignal;
    loadedLatency: boolean;
    emit: PhaseEventSink;
  }): Promise<ThroughputPhaseResult> {
    const sampling = options.config.test.sampling;
    const run = new MeasurementRun(
      options.phase,
      sampling,
      options.config.result.includeRawSamples,
      nowMs,
    );
    const latency = new LatencyCollector(options.emit.latency);
    const bytesPerWorker = options.phase === "download" ? 1_250_000 : 625_000;
    const workerCount = options.config.test[options.phase].workers;

    for (
      let index = 0;
      index < run.totalSamples && !options.signal.aborted;
      index += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const sampleAt = nowMs() + sampling.intervalMs;
      for (let worker = 0; worker < workerCount; worker += 1) {
        run.record({
          workerId: `${options.phase}-${worker}`,
          bytes: bytesPerWorker,
          at: sampleAt,
        });
      }
      const sample = run.sample(sampleAt);
      options.emit.sample(sample);
      if (options.loadedLatency && options.config.test.latency.enabled) {
        latency.record({
          phase: options.phase,
          startedAtMs: sample.startedAtMs,
          endedAtMs: sample.endedAtMs,
          latencyMs: options.phase === "download" ? 18 + index : 26 + index,
          ok: true,
        });
      }
    }

    const { throughput, windows } = run.finish();
    for (const window of windows) {
      options.emit.window(window);
    }

    return {
      workersStarted: workerCount,
      loadedLatency:
        options.loadedLatency && options.config.test.latency.enabled
          ? latency.aggregate()
          : null,
      throughput,
      workerErrors: [],
    };
  }
}

export async function runWorkerPhase(options: {
  phase: ThroughputPhase;
  config: NormalizedSpeedTestConfig;
  runId: string;
  uploadTransport: "fetch-stream" | "xhr-chunked";
  loadedLatency: boolean;
  signal: AbortSignal;
  emit: PhaseEventSink;
}): Promise<ThroughputPhaseResult> {
  const sampling = options.config.test.sampling;
  const run = new MeasurementRun(
    options.phase,
    sampling,
    options.config.result.includeRawSamples,
    nowMs,
  );
  const latency = new LatencyCollector(options.emit.latency);
  const throughputErrors: Error[] = [];
  const workers = new WorkerPool((event) => {
    handleWorkerEvent(event, "throughput");
  });
  const loadedLatency = new WorkerPool((event) => {
    handleWorkerEvent(event, "latency");
  });

  function handleWorkerEvent(
    event: WorkerEvent,
    source: "throughput" | "latency",
  ): void {
    if (event.type === "ready" && source === "throughput") {
      readyThroughputWorkers += 1;
    }
    if (event.type === "bytes" && event.phase === options.phase) {
      run.record(event);
      totalBytesObserved += event.bytes;
    }
    if (event.type === "latency" && event.phase === options.phase) {
      const endedAtMs = nowMs();
      latency.record({
        phase: event.phase,
        startedAtMs: Math.max(0, endedAtMs - event.latencyMs),
        endedAtMs,
        latencyMs: event.latencyMs,
        ok: event.ok,
      });
    }
    if (event.type === "error" && source === "throughput") {
      throughputErrors.push(new Error(`${event.workerId}: ${event.error.message}`));
    }
  }

  const throughputConfig = options.config.test[options.phase];
  let sampleCount = 0;
  let workersStarted = 0;
  let readyThroughputWorkers = 0;
  // Cumulative bytes seen across the whole phase. The unreachable/hung-connection
  // guards key off this, never off a single sample — so a stream that transfers,
  // dips to a 0 window, then resumes is never mistaken for a dead connection.
  let totalBytesObserved = 0;
  // If not one byte has arrived this long after the phase started, the endpoint is
  // unreachable or not serving data; fail fast rather than running a silent zero run.
  // Configurable per phase; 0 disables the early watchdog (the end-of-phase
  // zero-transfer backstop still applies).
  const firstByteTimeoutMs = options.config.test[options.phase].firstByteTimeoutMs;
  const allWorkersFailed = (): boolean =>
    throughputErrors.length >= throughputConfig.workers;
  let thrown: unknown = null;
  try {
    for (let worker = 0; worker < throughputConfig.workers; worker += 1) {
      const workerId = `${options.phase}-${worker}`;
      workers.start(
        workerId,
        createThroughputWorker(workerId, options.phase, options.uploadTransport),
        options.phase === "download"
          ? {
              type: "start-download",
              job: {
                workerId,
                target: options.config.targets.download,
                runId: options.runId,
              },
            }
          : {
              type: "start-upload",
              job: {
                workerId,
                target: options.config.targets.upload,
                runId: options.runId,
                chunkSizeBytes:
                  options.uploadTransport === "fetch-stream"
                    ? options.config.test.upload.streamChunkSizeBytes
                    : options.config.test.upload.fallbackChunkSizeBytes,
              },
            },
      );
    }

    if (options.loadedLatency && options.config.test.latency.enabled) {
      const workerId = `${options.phase}-latency`;
      loadedLatency.start(workerId, createLoadedLatencyWorker(workerId), {
        type: "start-loaded-latency",
        job: {
          workerId,
          target: options.config.targets.latency,
          phase: options.phase,
          intervalMs: options.config.test.latency.loadedIntervalMs,
          timeoutMs: options.config.test.latency.timeoutMs,
          method: options.config.test.latency.method,
        },
      });
    }

    const phaseStarted = nowMs();
    run.resetClock(phaseStarted);
    while (!options.signal.aborted && sampleCount < run.totalSamples) {
      await abortableDelay(sampling.intervalMs, options.signal);
      const sample = run.sample(nowMs());
      sampleCount += 1;
      options.emit.sample(sample);
      if (
        firstByteTimeoutMs > 0 &&
        totalBytesObserved === 0 &&
        nowMs() - phaseStarted >= firstByteTimeoutMs
      ) {
        throw new Error(
          `No ${options.phase} data arrived within ${firstByteTimeoutMs} ms; the endpoint looks unreachable or isn't serving test data.`,
        );
      }
      const maxDurationReached =
        throughputConfig.maxDurationMs !== null &&
        nowMs() - phaseStarted >= throughputConfig.maxDurationMs;
      if (allWorkersFailed() || maxDurationReached) {
        break;
      }
    }
  } catch (error) {
    thrown = error;
  } finally {
    workersStarted = readyThroughputWorkers;
    workers.stop("phase complete");
    loadedLatency.stop("phase complete");
  }

  if (options.signal.aborted) {
    throw new PartialThroughputPhaseError(
      "Run aborted",
      buildThroughputPhaseResult({
        phase: options.phase,
        run,
        latency,
        workersStarted,
        throughputErrors,
        loadedLatency: options.loadedLatency && options.config.test.latency.enabled,
      }),
    );
  }
  if (thrown) {
    throw thrown;
  }
  // Checked after the loop so no exit path, including maxDurationMs, can turn a
  // phase where every worker failed into a success.
  if (allWorkersFailed()) {
    throw throughputErrors[0] ?? new Error(`${options.phase} workers failed`);
  }
  // Backstop for when the phase completes its samples before the first-byte
  // watchdog could fire (e.g. a very short run): zero cumulative bytes means the
  // server never sent anything, which is a failure, not a real 0 Mbps result.
  if (totalBytesObserved === 0) {
    throw new Error(
      `The ${options.phase} phase transferred no data; the endpoint looks unreachable or isn't serving test data.`,
    );
  }

  const result = buildThroughputPhaseResult({
    phase: options.phase,
    run,
    latency,
    workersStarted,
    throughputErrors,
    loadedLatency: options.loadedLatency && options.config.test.latency.enabled,
  });
  if (!result.throughput.windows?.some((window) => !window.warmup)) {
    throw new Error(
      noMeasuredWindowMessage(options.phase, throughputConfig.maxDurationMs, sampling),
    );
  }
  for (const window of result.throughput.windows) {
    options.emit.window(window);
  }

  return result;
}

function buildThroughputPhaseResult(input: {
  phase: ThroughputPhase;
  run: MeasurementRun;
  latency: LatencyCollector;
  workersStarted: number;
  throughputErrors: Error[];
  loadedLatency: boolean;
}): ThroughputPhaseResult {
  const { throughput } = input.run.finish();
  return {
    workersStarted: input.workersStarted,
    loadedLatency: input.loadedLatency ? input.latency.aggregate() : null,
    throughput,
    workerErrors: input.throughputErrors.map((error) => ({
      code: input.phase === "download" ? "download-failed" : "upload-failed",
      message: `${input.phase} worker failed: ${error.message}`,
      phase: input.phase,
      recoverable: true,
    })),
  };
}

function noMeasuredWindowMessage(
  phase: ThroughputPhase,
  maxDurationMs: number | null,
  sampling: NormalizedSamplingConfig,
): string {
  const firstMeasuredWindowMs =
    (sampling.warmupWindowCount + 1) * sampling.samplesPerWindow * sampling.intervalMs;
  return (
    `The ${phase} phase ended before a measured window completed. ` +
    `maxDurationMs is ${maxDurationMs} ms, but the sampling settings need about ` +
    `${firstMeasuredWindowMs} ms to finish the first measured window ` +
    `((warmupWindowCount + 1) × samplesPerWindow × intervalMs). ` +
    `Raise maxDurationMs or shorten the sampling settings.`
  );
}

function createThroughputWorker(
  id: string,
  phase: ThroughputPhase,
  uploadTransport: "fetch-stream" | "xhr-chunked",
): Worker {
  if (phase === "download") {
    return new Worker(
      new URL("../download/fetchStreamDownloadWorker.js", import.meta.url),
      {
        type: "module",
        name: id,
      },
    );
  }
  if (uploadTransport === "fetch-stream") {
    return new Worker(
      new URL("../upload/fetchStreamUploadWorker.js", import.meta.url),
      {
        type: "module",
        name: id,
      },
    );
  }
  return new Worker(new URL("../upload/xhrChunkedUploadWorker.js", import.meta.url), {
    type: "module",
    name: id,
  });
}

function createLoadedLatencyWorker(id: string): Worker {
  return new Worker(new URL("../latency/loadedLatencyWorker.js", import.meta.url), {
    type: "module",
    name: id,
  });
}
