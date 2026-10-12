import { normalizeConfig } from "@comet-speedtest/config";
import { describe, expect, it } from "vitest";

import type { SpeedSample } from "../../results/resultTypes";
import { buildWindows } from "../windows";

function sample(bytes: number, durationMs: number): SpeedSample {
  return {
    phase: "download",
    startedAtMs: 0,
    endedAtMs: durationMs,
    durationMs,
    bytes,
    bitsPerSecond: (bytes * 8 * 1000) / durationMs,
    warmup: false,
    workerBreakdown: [{ workerId: "w", bytes }],
  };
}

describe("buildWindows", () => {
  it("weights window throughput by sample duration", () => {
    const sampling = normalizeConfig({
      targets: { download: "/d", upload: "/u" },
      test: { sampling: { samplesPerWindow: 2, warmupWindowCount: 0 } },
    }).test.sampling;

    // A late timer: the same 1.25 MB over 100 ms and over 1,000 ms.
    const [window] = buildWindows(
      "download",
      [sample(1_250_000, 100), sample(1_250_000, 1_000)],
      sampling,
    );

    // 2.5 MB in 1.1 s is 18.18 Mbps, not the 55 Mbps mean of the two rates.
    expect(window?.averageBitsPerSecond).toBeCloseTo(18_181_818.18, 1);
  });
});
