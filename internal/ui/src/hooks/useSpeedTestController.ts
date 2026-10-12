import type { NormalizedSpeedTestConfig } from "@comet-speedtest/config";
import {
  createSpeedTest,
  type PartialResult,
  type SpeedSample,
  type SpeedTestConfig,
  type SpeedTestError,
  type SpeedTestEvent,
  type SpeedTestEventHandler,
  type SpeedTestResult,
  type SpeedTestRunOptions,
  type SpeedTestState,
} from "@comet-speedtest/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SpeedTestEngineHandle = ReturnType<typeof createSpeedTest>;
type ActiveRun = { engine: SpeedTestEngineHandle; stopRequested: boolean };
/** An `engine.run()` call, which can outlive the controller run that made it. */
type EngineRun = { engine: SpeedTestEngineHandle; settled: Promise<void> };

const DISPOSED_REASON =
  "The speed test controller was disposed while the run was active.";

/**
 * Every engine event, since each one follows a change to the engine's state.
 * Keyed by event type so the compiler flags an event added to the engine later.
 */
const ENGINE_EVENTS = Object.keys({
  start: true,
  "phase-start": true,
  sample: true,
  "phase-reset": true,
  window: true,
  "latency-sample": true,
  "phase-complete": true,
  result: true,
  error: true,
} satisfies Record<SpeedTestEvent["type"], true>) as SpeedTestEvent["type"][];

export function useSpeedTestController(config: SpeedTestConfig): {
  state: SpeedTestState;
  result: SpeedTestResult | null;
  error: SpeedTestError | null;
  partial: PartialResult | null;
  samples: SpeedSample[];
  config: NormalizedSpeedTestConfig;
  start: (options?: SpeedTestRunOptions) => Promise<void>;
  stop: () => void;
} {
  const configSignature = useMemo(() => signatureConfig(config), [config]);

  // One stable engine per config. Recreated (during render, keyed by signature)
  // only when the config actually changes, so getState/getConfig and the
  // normalized config it exposes keep a stable identity between runs.
  const engineRef = useRef<SpeedTestEngineHandle | null>(null);
  const signatureRef = useRef<string | null>(null);
  if (engineRef.current === null || signatureRef.current !== configSignature) {
    engineRef.current = createSpeedTest(config);
    signatureRef.current = configSignature;
  }
  const engine = engineRef.current;

  const [state, setState] = useState<SpeedTestState>(() => engine.getState());
  const [result, setResult] = useState<SpeedTestResult | null>(null);
  const [error, setError] = useState<SpeedTestError | null>(null);
  const [partial, setPartial] = useState<PartialResult | null>(null);
  const [samples, setSamples] = useState<SpeedSample[]>([]);
  const activeRunRef = useRef<ActiveRun | null>(null);
  const lastEngineRunRef = useRef<EngineRun | null>(null);
  // The engine the run-owned view (result, error, partial, samples) belongs to.
  const viewEngineRef = useRef(engine);

  // Each engine starts with a fresh view. `state` mirrors the engine for as long
  // as it is mounted, whichever run is in flight: this hook is the engine's only
  // driver, and a run disposed here may still be settling when the effect runs
  // again (Fast Refresh, `<Activity>`). Cleanup runs on config change and on
  // unmount, and stops the run this engine owns (ADR 0005) without waiting for
  // it to settle; the next `start()` on the same engine waits instead.
  useEffect(() => {
    const sync = (): void => setState(engine.getState());
    sync();
    // A re-run on the same engine keeps the finished run on screen.
    if (viewEngineRef.current !== engine) {
      viewEngineRef.current = engine;
      setResult(null);
      setError(null);
      setPartial(null);
      setSamples([]);
    }
    const unsubscribers = ENGINE_EVENTS.map((type) => engine.on(type, sync));
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      const activeRun = activeRunRef.current;
      activeRunRef.current = null;
      activeRun?.engine.stop(DISPOSED_REASON);
    };
  }, [engine]);

  const start = useCallback(
    async (options?: SpeedTestRunOptions) => {
      if (activeRunRef.current) {
        return;
      }
      const activeRun: ActiveRun = { engine, stopRequested: false };
      activeRunRef.current = activeRun;
      setResult(null);
      setError(null);
      setPartial(null);
      setSamples([]);
      const isCurrentRun = (): boolean => activeRunRef.current === activeRun;
      // A disposed run (StrictMode's simulated unmount, for one) may still be
      // aborting, and the engine rejects a second concurrent run.
      const previousEngineRun = lastEngineRunRef.current;
      if (previousEngineRun?.engine === engine) {
        await previousEngineRun.settled;
        if (!isCurrentRun()) {
          return;
        }
      }
      // Every run-owned update goes through here, so a superseded run never writes.
      const subscribe = <TEvent extends SpeedTestEvent["type"]>(
        type: TEvent,
        handler: SpeedTestEventHandler<TEvent>,
      ) =>
        engine.on(type, (event) => {
          if (isCurrentRun()) {
            handler(event);
          }
        });
      const unsubscribers = [
        subscribe("sample", (event) => {
          setSamples((current) => [...current, event.sample]);
        }),
        subscribe("phase-reset", (event) => {
          setSamples((current) =>
            current.filter((sample) => sample.phase !== event.phase),
          );
        }),
        subscribe("result", (event) => setResult(event.result)),
        subscribe("error", (event) => setError(event.error)),
      ];
      try {
        const running = engine.run(options);
        lastEngineRunRef.current = { engine, settled: running.then(ignore, ignore) };
        if (activeRun.stopRequested) {
          engine.stop();
        }
        const outcome = await running;
        if (!isCurrentRun()) {
          return;
        }
        if (outcome.ok) {
          setResult(outcome.result);
        } else {
          setError(outcome.error);
          setPartial(outcome.partial);
        }
      } finally {
        unsubscribers.forEach((unsubscribe) => unsubscribe());
        if (isCurrentRun()) {
          activeRunRef.current = null;
        }
      }
    },
    [engine],
  );

  const stop = useCallback(() => {
    const activeRun = activeRunRef.current;
    if (!activeRun) {
      return;
    }
    // Covers a run still waiting for the engine: it stops as soon as it starts.
    activeRun.stopRequested = true;
    activeRun.engine.stop();
  }, []);

  return {
    state,
    result,
    error,
    partial,
    samples,
    config: engine.getConfig(),
    start,
    stop,
  };
}

function ignore(): void {}

function signatureConfig(config: SpeedTestConfig): string {
  if (
    typeof config === "object" &&
    config !== null &&
    "diagnostics" in config &&
    typeof config.diagnostics === "object" &&
    config.diagnostics !== null &&
    "configHash" in config.diagnostics
  ) {
    return String(config.diagnostics.configHash);
  }
  return JSON.stringify(config);
}
