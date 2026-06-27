import type { SpeedSample } from "@lightspeed/core";
import { describe, expect, it } from "vitest";

import { rollingPercentileBitsPerSecond } from "./rollingThroughput";

describe("rollingPercentileBitsPerSecond", () => {
  it("uses the 75th percentile of the latest configured number of samples for a phase", () => {
    const samples = [
      sample("download", 10),
      sample("download", 20),
      sample("upload", 500),
      sample("download", 30),
      sample("download", 40),
    ];

    expect(rollingPercentileBitsPerSecond(samples, "download", 3)).toBe(35_000_000);
  });

  it("returns null when the phase has no samples", () => {
    expect(rollingPercentileBitsPerSecond([sample("download", 10)], "upload", 3)).toBe(
      null,
    );
  });
});

function sample(phase: SpeedSample["phase"], mbps: number): SpeedSample {
  return {
    phase,
    startedAtMs: mbps,
    endedAtMs: mbps + 1,
    durationMs: 1,
    bytes: 1,
    bitsPerSecond: mbps * 1_000_000,
    warmup: false,
    workerBreakdown: [],
  };
}
