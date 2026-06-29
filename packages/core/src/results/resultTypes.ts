import type {
  NormalizedSpeedTestConfig,
  RuntimeConfig,
  RuntimeTestSelectionConfig,
  SpeedTestRunPhase,
} from "@comet-speedtest/config";

export type {
  RuntimeTestSelectionConfig,
  SpeedTestRunPhase,
} from "@comet-speedtest/config";

export type SpeedTestPhase = "idle-latency" | "download" | "upload" | "finalize";
export type ThroughputPhase = "download" | "upload";

export interface SpeedSample {
  phase: ThroughputPhase;
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  bytes: number;
  bitsPerSecond: number;
  warmup: boolean;
  workerBreakdown: Array<{ workerId: string; bytes: number }>;
}

export interface SpeedWindow {
  phase: ThroughputPhase;
  index: number;
  sampleCount: number;
  startedAtMs: number;
  endedAtMs: number;
  averageBitsPerSecond: number;
  sampleIndexes: number[];
  warmup: boolean;
}

export interface LatencySample {
  phase: "idle" | "download" | "upload";
  startedAtMs: number;
  endedAtMs: number;
  latencyMs: number;
  ok: boolean;
}

export interface LatencyResult {
  meanMs: number | null;
  medianMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  p95Ms: number | null;
  /**
   * Mean of the absolute differences between consecutive successful samples
   * (RFC 3393 IPDV) — "how much the round-trip bounces". `null` when fewer than
   * two successful samples exist. Computed in chronological order, not sorted.
   */
  jitterMs: number | null;
  samples: LatencySample[];
}

export type BufferbloatGrade = "A" | "B" | "C" | "D" | "F";

/** Latency added under load, and its grade, for one direction (download/upload). */
export interface BufferbloatDirection {
  loadedLatencyMs: number;
  addedLatencyMs: number;
  grade: BufferbloatGrade;
}

/**
 * Latency added under load relative to idle, graded A–F. The top-level `grade`
 * is taken on the worst of the two directions (whichever saturated link bloats
 * more); `download` and `upload` carry each direction's own added latency and
 * grade so they can be reported separately. Top-level fields are `null` when
 * idle or loaded latency was not measured; a direction is `null` when that
 * direction's loaded latency is missing.
 */
export interface BufferbloatResult {
  idleLatencyMs: number | null;
  loadedLatencyMs: number | null;
  addedLatencyMs: number | null;
  grade: BufferbloatGrade | null;
  download: BufferbloatDirection | null;
  upload: BufferbloatDirection | null;
}

export interface ThroughputResult {
  bitsPerSecond: number;
  bytesTransferred: number;
  durationMs: number;
  percentile: number;
  sampleIntervalMs: number;
  samplesPerWindow: number;
  measuredWindowCount: number;
  warmupWindowCount: number;
  samples?: SpeedSample[];
  windows?: SpeedWindow[];
}

export interface CapabilityReport {
  fetchResponseStreaming: boolean;
  fetchRequestStreaming: boolean;
  xhrUpload: boolean;
  workers: boolean;
  abortController: boolean;
}

export interface SpeedTestDiagnostics {
  userAgent: string;
  testSelection: {
    phases: SpeedTestRunPhase[];
    loadedLatency: Record<ThroughputPhase, boolean>;
  };
  requestedTransports: Record<ThroughputPhase, string | null>;
  actualTransports: Record<ThroughputPhase, "fetch-stream" | "xhr-chunked" | null>;
  measurementBasis: Record<ThroughputPhase, string | null>;
  fallbackReasons: string[];
  workersRequested: Record<ThroughputPhase, number>;
  workersStarted: Record<ThroughputPhase, number>;
  capabilityReport: CapabilityReport;
  configSource: string;
  errors: SpeedTestError[];
  submission?: { ok: boolean; status?: number; message?: string };
}

export interface SpeedTestResult {
  runId: string;
  startedAt: string;
  completedAt: string;
  configHash: string;
  download: ThroughputResult | null;
  upload: ThroughputResult | null;
  latency: {
    idle: LatencyResult | null;
    underDownloadLoad: LatencyResult | null;
    underUploadLoad: LatencyResult | null;
  };
  bufferbloat: BufferbloatResult;
  diagnostics: SpeedTestDiagnostics;
}

/**
 * The phases that finished before a run failed or was stopped, plus the
 * run diagnostics captured so far. This is the typed replacement for the old
 * untyped `error.diagnostics.speedTest.partialResult` side channel — it travels
 * on {@link RunOutcome} when `ok` is `false`.
 */
export interface PartialResult {
  runId: string;
  startedAt: string;
  completedAt: string;
  configHash: string;
  completedPhases: {
    idleLatency: LatencyResult | null;
    download: ThroughputResult | null;
    underDownloadLoad: LatencyResult | null;
    upload: ThroughputResult | null;
    underUploadLoad: LatencyResult | null;
  };
  diagnostics: SpeedTestDiagnostics;
}

export type SpeedTestErrorCode =
  | "config-load-failed"
  | "config-invalid"
  | "transport-unsupported"
  | "target-unreachable"
  | "download-failed"
  | "upload-failed"
  | "latency-failed"
  | "worker-start-failed"
  | "aborted"
  | "timeout";

export interface SpeedTestError {
  code: SpeedTestErrorCode;
  message: string;
  phase?: SpeedTestPhase;
  cause?: unknown;
  recoverable: boolean;
  diagnostics?: Record<string, unknown>;
}

export type PhaseResult = ThroughputResult | LatencyResult;

export type SpeedTestEvent =
  | { type: "start"; runId: string; config: NormalizedSpeedTestConfig }
  | { type: "phase-start"; phase: SpeedTestPhase }
  | { type: "sample"; sample: SpeedSample }
  | { type: "window"; window: SpeedWindow }
  | { type: "latency-sample"; sample: LatencySample }
  | { type: "phase-complete"; phase: SpeedTestPhase; result: PhaseResult }
  | { type: "result"; result: SpeedTestResult }
  | { type: "error"; error: SpeedTestError };

export interface SpeedTestState {
  status: "idle" | "running" | "complete" | "error" | "aborted";
  phase: SpeedTestPhase | null;
  runId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  latestSample: SpeedSample | null;
  latestLatencySample: LatencySample | null;
  result: SpeedTestResult | null;
  error: SpeedTestError | null;
}

export type SpeedTestConfig = RuntimeConfig | NormalizedSpeedTestConfig;
export type Unsubscribe = () => void;
export type SpeedTestEventHandler<TEvent extends SpeedTestEvent["type"]> = (
  event: Extract<SpeedTestEvent, { type: TEvent }>,
) => void;

/**
 * The outcome of a single {@link SpeedTestEngine.run}. A measurement failure is
 * a value, not a thrown error: inspect `ok`, then read `result` or
 * `error` + `partial`. `run()` only ever *throws* for misuse (e.g. starting a
 * run while one is already active).
 */
export type RunOutcome =
  | { ok: true; result: SpeedTestResult }
  | { ok: false; error: SpeedTestError; partial: PartialResult | null };

export interface SpeedTestEngine {
  run(options?: SpeedTestRunOptions): Promise<RunOutcome>;
  stop(reason?: string): void;
  on<TEvent extends SpeedTestEvent["type"]>(
    event: TEvent,
    handler: SpeedTestEventHandler<TEvent>,
  ): Unsubscribe;
  getState(): SpeedTestState;
  /** The normalized config this engine runs — defaults filled, hash computed. */
  getConfig(): NormalizedSpeedTestConfig;
}

export interface SpeedTestRunOptions {
  selection?: RuntimeTestSelectionConfig;
}
