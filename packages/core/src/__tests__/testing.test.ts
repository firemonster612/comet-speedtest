import type { RuntimeConfig } from "@comet-speedtest/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RunOutcome } from "../results/resultTypes";
import { createTestSpeedTest, SyntheticMeasurementAdapter } from "../testing";

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
});
