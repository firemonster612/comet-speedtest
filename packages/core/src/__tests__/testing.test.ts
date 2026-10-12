import type { RuntimeConfig } from "@comet-speedtest/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LatencySample, RunOutcome } from "../results/resultTypes";
import {
  createTestSpeedTest,
  type DeterministicPhaseAdapter,
  type IdleLatencyOptions,
  SyntheticMeasurementAdapter,
} from "../testing";
import { detectCapabilities } from "../transport/capabilities";

// Default test settings, so idle latency, loaded latency and both throughput
// phases all run.
const config: RuntimeConfig = {
  targets: { download: "/download.bin", upload: "/upload", latency: "/latency" },
};

/** The run's measurements, without the per-run id and wall-clock timestamps. */
function measurements(outcome: RunOutcome) {
  if (!outcome.ok) {
    throw new Error(`expected a complete run, got ${outcome.error.code}`);
  }
  const {
    runId: _runId,
    startedAt: _startedAt,
    completedAt: _completedAt,
    ...rest
  } = outcome.result;
  return rest;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("@comet-speedtest/core/testing", () => {
  it("runs the documented example offline, without Workers, with identical results", async () => {
    const fetch = vi.fn(() => Promise.reject(new Error("network used")));
    vi.stubGlobal("fetch", fetch);
    expect(typeof Worker).toBe("undefined");

    async function documentedExample(): Promise<RunOutcome> {
      const engine = createTestSpeedTest(config, {
        measurementAdapter: new SyntheticMeasurementAdapter(),
      });

      const outcome = await engine.run();
      return outcome;
    }

    const first = await documentedExample();
    const second = await documentedExample();

    expect(fetch).not.toHaveBeenCalled();
    expect(measurements(first)).toEqual(measurements(second));
    const result = measurements(first);
    expect(result.latency.idle?.samples).toHaveLength(8);
    expect(result.latency.underDownloadLoad).not.toBeNull();
    expect(result.download?.bitsPerSecond).toBeGreaterThan(0);
    expect(result.upload?.bitsPerSecond).toBeGreaterThan(0);
  });

  it("gives each engine its own default capability report", async () => {
    const adapter = new SyntheticMeasurementAdapter();
    const first = measurements(
      await createTestSpeedTest(config, { measurementAdapter: adapter }).run(),
    );
    first.diagnostics.capabilityReport.workers = false;

    const second = await createTestSpeedTest(config, {
      measurementAdapter: adapter,
    }).run();

    expect(second.ok).toBe(true);
  });

  it("detects capabilities when no adapter replaces the network", async () => {
    const outcome = await createTestSpeedTest(config).run();

    const diagnostics = outcome.ok
      ? outcome.result.diagnostics
      : outcome.partial?.diagnostics;
    expect(diagnostics?.capabilityReport).toEqual(detectCapabilities());
  });

  it("ignores idle latency samples an adapter emits after the phase settles", async () => {
    const synthetic = new SyntheticMeasurementAdapter();
    let lateEmit: ((sample: LatencySample) => void) | undefined;
    const adapter: DeterministicPhaseAdapter = {
      runIdleLatency(options: IdleLatencyOptions) {
        lateEmit = options.emit;
        return synthetic.runIdleLatency(options);
      },
      runPhase: (options) => synthetic.runPhase(options),
    };
    const engine = createTestSpeedTest(config, { measurementAdapter: adapter });
    const received: number[] = [];
    engine.on("latency-sample", (event) => received.push(event.sample.latencyMs));
    await engine.run();
    const countAfterRun = received.length;
    expect(lateEmit).toBeDefined();
    expect(countAfterRun).toBeGreaterThan(0);

    lateEmit?.({
      phase: "idle",
      startedAtMs: 0,
      endedAtMs: 999,
      latencyMs: 999,
      ok: true,
    });

    expect(received).toHaveLength(countAfterRun);
    expect(engine.getState().latestLatencySample?.latencyMs).not.toBe(999);
  });
});
