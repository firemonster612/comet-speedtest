import {
  normalizeConfig,
  normalizeTestSelection,
  type NormalizedSpeedTestConfig,
  type NormalizedTestSelectionConfig,
} from "@comet-speedtest/config";

import { probeReachability, runIdleLatency } from "../latency/latencyProbe";
import { gradeBufferbloat } from "../results/bufferbloat";
import type {
  CapabilityReport,
  PartialResult,
  RunOutcome,
  SpeedTestConfig,
  SpeedTestDiagnostics,
  SpeedTestEngine as SpeedTestEngineInterface,
  SpeedTestError,
  SpeedTestEvent,
  SpeedTestEventHandler,
  SpeedTestPhase,
  SpeedTestResult,
  SpeedTestRunOptions,
  SpeedTestState,
  ThroughputPhase,
  Unsubscribe,
  LatencyResult,
  LatencySample,
} from "../results/resultTypes";
import { detectCapabilities } from "../transport/capabilities";
import { type ResolvedTransports, resolveTransports } from "../transport/registry";
import { initialState, makeRunId, toSpeedTestError } from "./lifecycle";
import {
  PartialThroughputPhaseError,
  type DeterministicPhaseAdapter,
  type PhaseEventSink,
  type ThroughputPhaseResult,
  runWorkerPhase,
} from "./phases";

export interface SpeedTestEngineOptions {
  baseUrl?: string;
  capabilities?: CapabilityReport;
  measurementAdapter?: DeterministicPhaseAdapter;
}

type Listener = (event: SpeedTestEvent) => void;

export class SpeedTestEngine implements SpeedTestEngineInterface {
  /**
   * Per event type, each listener and a token for its current registration. A
   * listener removed and re-added gets a new token, so a dispatch already in
   * progress skips it (DOM `EventTarget` semantics).
   */
  private readonly handlers = new Map<SpeedTestEvent["type"], Map<Listener, object>>();
  private readonly config: NormalizedSpeedTestConfig;
  private readonly adapter: DeterministicPhaseAdapter | undefined;
  private state = initialState();
  private activeController: AbortController | null = null;
  /**
   * Why fetch-stream upload failed on an earlier run where the xhr-chunked retry
   * then succeeded. That failure comes from the browser/server pairing (for
   * example Chrome refusing streaming uploads over HTTP/1.1), so it repeats on
   * every run; later runs go straight to xhr-chunked instead of paying for the
   * failed attempt again.
   */
  private fetchUploadFailure: string | null = null;

  constructor(
    config: SpeedTestConfig,
    private readonly options: SpeedTestEngineOptions = {},
  ) {
    this.config = isNormalized(config)
      ? config
      : normalizeConfig(config, {
          baseUrl:
            options.baseUrl ??
            (typeof location === "undefined" ? "http://localhost/" : location.href),
        });
    this.adapter = options.measurementAdapter;
  }

  getConfig(): NormalizedSpeedTestConfig {
    return this.config;
  }

  async run(options: SpeedTestRunOptions = {}): Promise<RunOutcome> {
    if (this.state.status === "running") {
      // Misuse, not a measurement failure — the one path that still throws.
      throw {
        code: "aborted",
        message: "A speed test run is already active.",
        recoverable: true,
      } satisfies SpeedTestError;
    }

    let selection: NormalizedTestSelectionConfig;
    try {
      selection = resolveRunSelection(this.config.test.selection, options);
    } catch (error) {
      return this.failSelection(error);
    }
    const selectedThroughputPhases = selection.phases.filter(
      (phase): phase is ThroughputPhase => phase === "download" || phase === "upload",
    );
    const runId = makeRunId();
    const startedAt = new Date().toISOString();
    const controller = new AbortController();
    this.activeController = controller;
    this.state = {
      ...initialState(),
      status: "running",
      runId,
      startedAt,
    };

    const diagnostics: SpeedTestDiagnostics = {
      userAgent: typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
      testSelection: selection,
      requestedTransports: {
        download: selectedThroughputPhases.includes("download")
          ? this.config.test.download.transport
          : null,
        upload: selectedThroughputPhases.includes("upload")
          ? this.config.test.upload.transport
          : null,
      },
      actualTransports: {
        download: null,
        upload: null,
      },
      measurementBasis: {
        download: null,
        upload: null,
      },
      fallbackReasons: [],
      workersRequested: {
        download: selectedThroughputPhases.includes("download")
          ? this.config.test.download.workers
          : 0,
        upload: selectedThroughputPhases.includes("upload")
          ? this.config.test.upload.workers
          : 0,
      },
      workersStarted: {
        download: 0,
        upload: 0,
      },
      capabilityReport: this.options.capabilities ?? detectCapabilities(),
      configSource: this.config.diagnostics.source,
      errors: [],
    };

    let idleResult: LatencyResult | null = null;
    let downloadResult: Awaited<ReturnType<typeof this.runThroughput>> | null = null;
    let uploadResult: Awaited<ReturnType<typeof this.runThroughput>> | null = null;

    let outcome: RunOutcome;
    try {
      const transports = this.resolveRunTransports(
        selectedThroughputPhases,
        diagnostics.capabilityReport,
      );
      diagnostics.requestedTransports = transports.requested;
      diagnostics.actualTransports = transports.actual;
      diagnostics.measurementBasis = measurementBasisFor(transports.actual);
      diagnostics.fallbackReasons = transports.fallbackReasons;

      this.emit({ type: "start", runId, config: this.config });

      const adapter = this.measurementAdapter();
      // Reachability gate. A fast probe of each target the run will use fails the
      // run immediately with a clear message when a target can't be reached at all
      // — instead of every phase silently producing zero-throughput windows and
      // timeout-as-latency. Opt-out via `test.latency.reachabilityCheck`. Skipped
      // under the synthetic/injected adapter (offline tests) so only real network
      // runs pay for it.
      if (this.config.test.latency.reachabilityCheck && !adapter) {
        await this.assertTargetReachable(selection, controller.signal);
      }

      if (selection.phases.includes("idle-latency")) {
        this.enterPhase("idle-latency", controller.signal);
        const idle = await this.runIdleLatency(controller.signal);
        idleResult = idle;
        this.emit({ type: "phase-complete", phase: "idle-latency", result: idle });
      }

      if (selection.phases.includes("download")) {
        const downloadTransport = transports.actual.download;
        if (!downloadTransport) {
          throw transportMissingError("download");
        }
        this.enterPhase("download", controller.signal);
        const download = await this.runThroughput(
          "download",
          runId,
          downloadTransport,
          selection.loadedLatency.download,
          controller.signal,
        );
        downloadResult = download;
        diagnostics.workersStarted.download = download.workersStarted;
        diagnostics.errors.push(...download.workerErrors);
        this.emit({
          type: "phase-complete",
          phase: "download",
          result: download.throughput,
        });
      }

      if (selection.phases.includes("upload")) {
        const uploadTransport = transports.actual.upload;
        if (!uploadTransport) {
          throw transportMissingError("upload");
        }
        this.enterPhase("upload", controller.signal);
        const upload = await this.runUploadWithRuntimeFallback(
          runId,
          uploadTransport,
          selection.loadedLatency.upload,
          diagnostics,
          controller.signal,
        );
        uploadResult = upload;
        diagnostics.workersStarted.upload = upload.workersStarted;
        diagnostics.errors.push(...upload.workerErrors);
        this.emit({
          type: "phase-complete",
          phase: "upload",
          result: upload.throughput,
        });
      }

      this.enterPhase("finalize", controller.signal);
      const latency = {
        idle: idleResult,
        underDownloadLoad: downloadResult?.loadedLatency ?? null,
        underUploadLoad: uploadResult?.loadedLatency ?? null,
      };
      const result: SpeedTestResult = {
        runId,
        startedAt,
        completedAt: new Date().toISOString(),
        configHash: this.config.diagnostics.configHash,
        download: downloadResult?.throughput ?? null,
        upload: uploadResult?.throughput ?? null,
        latency,
        bufferbloat: gradeBufferbloat(latency),
        diagnostics,
      };
      // A `phase-start: finalize` listener may have stopped the run.
      controller.signal.throwIfAborted();
      outcome = { ok: true, result };
    } catch (error) {
      outcome = this.failureOutcome(error, {
        aborted: controller.signal.aborted,
        diagnostics,
        runId,
        startedAt,
        idle: idleResult,
        download: downloadResult,
        upload: uploadResult,
      });
    }
    this.settleRun(outcome, controller.signal.aborted);
    return outcome;
  }

  /**
   * The run's last act: release the engine, record the outcome, then publish it.
   * Publishing comes last because a `result` or `error` listener may start the
   * next run, and from then on the shared state belongs to that run.
   */
  private settleRun(outcome: RunOutcome, aborted: boolean): void {
    this.activeController = null;
    if (outcome.ok) {
      this.state = {
        ...this.state,
        status: "complete",
        phase: null,
        completedAt: outcome.result.completedAt,
        result: outcome.result,
      };
      this.emit({ type: "result", result: outcome.result });
      return;
    }
    this.state = {
      ...this.state,
      status: aborted ? "aborted" : "error",
      completedAt: outcome.partial?.completedAt ?? new Date().toISOString(),
      error: outcome.error,
    };
    this.emit({ type: "error", error: outcome.error });
  }

  /**
   * Assemble a failure outcome: merge any partial phase result into diagnostics,
   * build the typed {@link PartialResult} snapshot, and return `{ ok: false }`.
   * Kept off the `run()` happy path so that method reads as the phase narrative.
   */
  private failureOutcome(
    error: unknown,
    ctx: {
      aborted: boolean;
      diagnostics: SpeedTestDiagnostics;
      runId: string;
      startedAt: string;
      idle: LatencyResult | null;
      download: ThroughputPhaseResult | null;
      upload: ThroughputPhaseResult | null;
    },
  ): RunOutcome {
    const { diagnostics } = ctx;
    let download = ctx.download;
    let upload = ctx.upload;

    const fallbackError: SpeedTestError = {
      code: ctx.aborted ? "aborted" : errorCodeForPhase(this.state.phase),
      message: "Speed test failed.",
      recoverable: true,
    };
    if (this.state.phase) {
      fallbackError.phase = this.state.phase;
    }
    const partialPhase = readPartialPhaseResult(error);
    if (partialPhase && this.state.phase === "download" && !download) {
      download = partialPhase;
      diagnostics.workersStarted.download = partialPhase.workersStarted;
      diagnostics.errors.push(...partialPhase.workerErrors);
    }
    if (partialPhase && this.state.phase === "upload" && !upload) {
      upload = partialPhase;
      diagnostics.workersStarted.upload = partialPhase.workersStarted;
      diagnostics.errors.push(...partialPhase.workerErrors);
    }
    const speedError = toSpeedTestError(error, fallbackError);
    const completedAt = new Date().toISOString();
    diagnostics.errors.push({
      code: speedError.code,
      message: speedError.message,
      recoverable: speedError.recoverable,
      ...(speedError.phase ? { phase: speedError.phase } : {}),
    });
    const partial: PartialResult = {
      runId: ctx.runId,
      startedAt: ctx.startedAt,
      completedAt,
      configHash: this.config.diagnostics.configHash,
      completedPhases: {
        idleLatency: ctx.idle,
        download: download?.throughput ?? null,
        underDownloadLoad: download?.loadedLatency ?? null,
        upload: upload?.throughput ?? null,
        underUploadLoad: upload?.loadedLatency ?? null,
      },
      diagnostics,
    };
    return { ok: false, error: speedError, partial };
  }

  /**
   * A run that never started because the per-call selection was invalid. There
   * is no diagnostics snapshot or partial to report — just the typed error.
   */
  private failSelection(error: unknown): RunOutcome {
    const speedError = toSpeedTestError(error, {
      code: "config-invalid",
      message: "Invalid run selection.",
      recoverable: true,
    });
    this.state = {
      ...initialState(),
      status: "error",
      completedAt: new Date().toISOString(),
      error: speedError,
    };
    this.emit({ type: "error", error: speedError });
    return { ok: false, error: speedError, partial: null };
  }

  stop(reason = "User stopped the run."): void {
    if (this.activeController) {
      this.activeController.abort(reason);
    }
  }

  on<TEvent extends SpeedTestEvent["type"]>(
    event: TEvent,
    handler: SpeedTestEventHandler<TEvent>,
  ): Unsubscribe {
    const listener = handler as Listener;
    const registrations = this.handlers.get(event) ?? new Map<Listener, object>();
    this.handlers.set(event, registrations);
    if (!registrations.has(listener)) {
      registrations.set(listener, {});
    }
    return () => registrations.delete(listener);
  }

  getState(): SpeedTestState {
    return structuredCloneSafe(this.state);
  }

  private async runIdleLatency(signal: AbortSignal): Promise<LatencyResult> {
    const adapter = this.measurementAdapter();
    // Closed once the phase settles, like the throughput sink below.
    let open = true;
    const emit = (sample: LatencySample): void => {
      if (open) {
        this.emitLatency(sample);
      }
    };
    try {
      return await (adapter
        ? adapter.runIdleLatency({ config: this.config, signal, emit })
        : runIdleLatency(
            this.config.targets.latency,
            this.config.test.latency,
            emit,
            signal,
          ));
    } finally {
      open = false;
    }
  }

  private async runThroughput(
    phase: "download" | "upload",
    runId: string,
    uploadTransport: "fetch-stream" | "xhr-chunked",
    loadedLatency: boolean,
    signal: AbortSignal,
  ) {
    const adapter = this.measurementAdapter();
    // Closed once the attempt settles: a late worker message or adapter callback
    // must not reach listeners after `phase-complete` or `phase-reset`.
    let open = true;
    const emit: PhaseEventSink = {
      sample: (sample) => open && this.emitSample(sample),
      window: (window) => open && this.emitWindow(window),
      latency: (sample) => open && this.emitLatency(sample),
    };
    try {
      return await (adapter
        ? adapter.runPhase({ phase, config: this.config, signal, loadedLatency, emit })
        : runWorkerPhase({
            phase,
            config: this.config,
            runId,
            uploadTransport,
            loadedLatency,
            signal,
            emit,
          }));
    } finally {
      open = false;
    }
  }

  private resolveRunTransports(
    phases: ThroughputPhase[],
    capabilities: CapabilityReport,
  ): ResolvedTransports {
    const transports = resolveTransports(this.config, capabilities, { phases });
    if (
      this.fetchUploadFailure === null ||
      transports.actual.upload !== "fetch-stream" ||
      !capabilities.xhrUpload
    ) {
      return transports;
    }
    return {
      ...transports,
      actual: { ...transports.actual, upload: "xhr-chunked" },
      fallbackReasons: [
        ...transports.fallbackReasons,
        `fetch upload streaming failed at runtime on an earlier run (${this.fetchUploadFailure}); using xhr-chunked`,
      ],
    };
  }

  private async runUploadWithRuntimeFallback(
    runId: string,
    uploadTransport: "fetch-stream" | "xhr-chunked",
    loadedLatency: boolean,
    diagnostics: SpeedTestDiagnostics,
    signal: AbortSignal,
  ) {
    const { latestSample, latestLatencySample } = this.state;
    try {
      return await this.runThroughput(
        "upload",
        runId,
        uploadTransport,
        loadedLatency,
        signal,
      );
    } catch (error) {
      if (
        signal.aborted ||
        uploadTransport !== "fetch-stream" ||
        !this.config.test.upload.allowFallback ||
        !diagnostics.capabilityReport.xhrUpload
      ) {
        throw error;
      }
      const failure = error instanceof Error ? error.message : String(error);
      const reason = `fetch upload streaming failed at runtime (${failure}); fell back to xhr-chunked`;
      diagnostics.actualTransports.upload = "xhr-chunked";
      diagnostics.measurementBasis = measurementBasisFor(diagnostics.actualTransports);
      diagnostics.fallbackReasons.push(reason);
      // Nothing the failed attempt emitted describes the measurement that counts.
      this.state = { ...this.state, latestSample, latestLatencySample };
      this.emit({ type: "phase-reset", phase: "upload", reason });
      const upload = await this.runThroughput(
        "upload",
        runId,
        "xhr-chunked",
        loadedLatency,
        signal,
      );
      // The worker errors don't say whether streaming or the server was at fault;
      // only xhr-chunked succeeding where fetch-stream failed pins it on the transport.
      this.fetchUploadFailure = failure;
      return upload;
    }
  }

  /** The explicit test adapter that replaces the network, or null for a real run. */
  private measurementAdapter(): DeterministicPhaseAdapter | null {
    return this.adapter ?? null;
  }

  /** Phase boundary: a listener may have stopped the run since the last one. */
  private enterPhase(phase: SpeedTestPhase, signal: AbortSignal): void {
    signal.throwIfAborted();
    this.state = { ...this.state, phase };
    this.emit({ type: "phase-start", phase });
  }

  private emitSample(
    sample: Extract<SpeedTestEvent, { type: "sample" }>["sample"],
  ): void {
    this.state = { ...this.state, latestSample: sample };
    this.emit({ type: "sample", sample });
  }

  private emitWindow(
    window: Extract<SpeedTestEvent, { type: "window" }>["window"],
  ): void {
    this.emit({ type: "window", window });
  }

  private emitLatency(
    sample: Extract<SpeedTestEvent, { type: "latency-sample" }>["sample"],
  ): void {
    // A failed probe's "latency" is just the time until it errored or timed
    // out, not a reading — keep it out of the live tile (the aggregate drops
    // it too).
    if (sample.ok) {
      this.state = { ...this.state, latestLatencySample: sample };
    }
    this.emit({ type: "latency-sample", sample });
  }

  /**
   * Pre-flight connectivity gate. Probes every distinct target the selected run
   * will actually use (download / upload / latency) and throws a typed
   * `target-unreachable` error on the first one that can't be reached at all —
   * a network error or no response within the timeout (a hung/dropped
   * connection). A reachable endpoint that answers with a non-2xx status is left
   * to the throughput phases, so this never false-fails on a wrong-path 404.
   */
  private async assertTargetReachable(
    selection: NormalizedTestSelectionConfig,
    signal: AbortSignal,
  ): Promise<void> {
    for (const target of this.reachabilityTargets(selection)) {
      const probe = await probeReachability(target, this.config.test.latency, signal);
      if (!probe.reachable) {
        throw {
          code: "target-unreachable",
          message: `Couldn't reach the test server at ${target} (${probe.reason}). Check that the URL is correct, the server is running, and that it allows requests from this page (CORS).`,
          recoverable: true,
        } satisfies SpeedTestError;
      }
    }
  }

  /** The distinct target URLs the selected run will exercise, deduped. */
  private reachabilityTargets(selection: NormalizedTestSelectionConfig): string[] {
    const { targets } = this.config;
    const urls = new Set<string>();
    if (selection.phases.includes("idle-latency")) {
      urls.add(targets.latency);
    }
    if (selection.phases.includes("download")) {
      urls.add(targets.download);
    }
    if (selection.phases.includes("upload")) {
      urls.add(targets.upload);
    }
    // Loaded-latency probes hit the latency target during the throughput phases.
    if (selection.loadedLatency.download || selection.loadedLatency.upload) {
      urls.add(targets.latency);
    }
    if (urls.size === 0) {
      urls.add(targets.latency);
    }
    return [...urls];
  }

  /**
   * Dispatch like DOM `EventTarget`: listeners added during dispatch wait for
   * the next event, listeners removed during dispatch are skipped, and a
   * throwing listener is reported as an uncaught error while the remaining
   * listeners still run, so a consumer bug never changes the run's
   * measurements or outcome. Ending a run from a listener is `stop()`'s job.
   */
  private emit(event: SpeedTestEvent): void {
    const registrations = this.handlers.get(event.type);
    if (!registrations) {
      return;
    }
    for (const [listener, token] of [...registrations]) {
      if (registrations.get(listener) !== token) {
        continue;
      }
      try {
        listener(event);
      } catch (error) {
        reportUncaught(error);
      }
    }
  }
}

/** Report an exception the way the platform reports uncaught errors, without unwinding the caller. */
function reportUncaught(error: unknown): void {
  if (typeof reportError === "function") {
    reportError(error);
    return;
  }
  queueMicrotask(() => {
    throw error;
  });
}

function measurementBasisFor(actualTransports: {
  download: "fetch-stream" | "xhr-chunked" | null;
  upload: "fetch-stream" | "xhr-chunked" | null;
}): Record<ThroughputPhase, string | null> {
  return {
    download: actualTransports.download ? "response stream bytes read" : null,
    upload:
      actualTransports.upload === null
        ? null
        : actualTransports.upload === "fetch-stream"
          ? "request stream chunks taken by fetch"
          : "xhr upload progress events",
  };
}

function resolveRunSelection(
  baseSelection: NormalizedTestSelectionConfig,
  options: SpeedTestRunOptions,
): NormalizedTestSelectionConfig {
  try {
    return normalizeTestSelection(options.selection, baseSelection);
  } catch (error) {
    throw {
      code: "config-invalid",
      message: error instanceof Error ? error.message : String(error),
      recoverable: true,
      diagnostics: { selection: options.selection },
    } satisfies SpeedTestError;
  }
}

function transportMissingError(phase: ThroughputPhase): SpeedTestError {
  return {
    code: phase === "download" ? "download-failed" : "upload-failed",
    message: `No ${phase} transport was resolved for the selected run.`,
    phase,
    recoverable: false,
  };
}

function readPartialPhaseResult(error: unknown): ThroughputPhaseResult | null {
  if (error instanceof PartialThroughputPhaseError) {
    return error.partialPhaseResult;
  }
  if (typeof error === "object" && error !== null && "partialPhaseResult" in error) {
    return (error as { partialPhaseResult: ThroughputPhaseResult }).partialPhaseResult;
  }
  return null;
}

function errorCodeForPhase(phase: SpeedTestPhase | null): SpeedTestError["code"] {
  switch (phase) {
    case "idle-latency":
      return "latency-failed";
    case "download":
      return "download-failed";
    case "upload":
      return "upload-failed";
    case "finalize":
    case null:
      return "internal-error";
  }
}

function isNormalized(config: SpeedTestConfig): config is NormalizedSpeedTestConfig {
  return "diagnostics" in config && "configHash" in config.diagnostics;
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
