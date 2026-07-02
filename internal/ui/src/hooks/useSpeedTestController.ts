import type { NormalizedSpeedTestConfig } from "@comet-speedtest/config";
import {
  createSpeedTest,
  type PartialResult,
  type SpeedSample,
  type SpeedTestConfig,
  type SpeedTestError,
  type SpeedTestResult,
  type SpeedTestRunOptions,
  type SpeedTestState,
} from "@comet-speedtest/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SpeedTestEngineHandle = ReturnType<typeof createSpeedTest>;
type ActiveRun = { engine: SpeedTestEngineHandle };

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

  // When the engine (config) changes, abort any active run and reset the view.
  useEffect(() => {
    const activeRun = activeRunRef.current;
    if (activeRun) {
      activeRun.engine.stop("Config changed while the run was active.");
      activeRunRef.current = null;
    }
    setState(engine.getState());
    setResult(null);
    setError(null);
    setPartial(null);
    setSamples([]);
  }, [engine]);

  const start = useCallback(
    async (options?: SpeedTestRunOptions) => {
      if (activeRunRef.current) {
        return;
      }
      const activeRun: ActiveRun = { engine };
      activeRunRef.current = activeRun;
      setResult(null);
      setError(null);
      setPartial(null);
      setSamples([]);
      const isCurrentRun = (): boolean => activeRunRef.current === activeRun;
      const sync = (): void => {
        if (isCurrentRun()) {
          setState(engine.getState());
        }
      };
      const unsubscribers = [
        engine.on("start", sync),
        engine.on("phase-start", sync),
        engine.on("sample", (event) => {
          if (isCurrentRun()) {
            setSamples((current) => [...current, event.sample]);
          }
          sync();
        }),
        engine.on("window", sync),
        engine.on("latency-sample", sync),
        engine.on("phase-complete", sync),
        engine.on("result", (event) => {
          setResult(event.result);
          sync();
        }),
        engine.on("error", (event) => {
          setError(event.error);
          sync();
        }),
      ];
      try {
        const outcome = await engine.run(options);
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
          setState(engine.getState());
          activeRunRef.current = null;
        }
      }
    },
    [engine],
  );

  const stop = useCallback(() => {
    activeRunRef.current?.engine.stop();
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
