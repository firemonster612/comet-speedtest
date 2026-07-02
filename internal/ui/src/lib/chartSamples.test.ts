import type { SpeedSample } from "@comet-speedtest/core";
import { describe, expect, it } from "vitest";

import { selectChartSamples } from "./chartSamples";

describe("selectChartSamples", () => {
  it("keeps a normal completed run intact instead of dropping old download samples", () => {
    const samples = [
      ...Array.from({ length: 36 }, (_, index) => sample("download", index)),
      ...Array.from({ length: 36 }, (_, index) => sample("upload", index + 36)),
    ];

    const selected = selectChartSamples(samples, 180);

    expect(selected).toHaveLength(72);
    expect(selected.filter((item) => item.phase === "download")).toHaveLength(36);
    expect(selected.filter((item) => item.phase === "upload")).toHaveLength(36);
  });

  it("downsamples across the whole run and keeps both ends", () => {
    const samples = [
      ...Array.from({ length: 200 }, (_, index) => sample("download", index)),
      ...Array.from({ length: 200 }, (_, index) => sample("upload", index + 200)),
    ];

    const selected = selectChartSamples(samples, 80);

    expect(selected).toHaveLength(80);
    expect(selected[0]?.phase).toBe("download");
    expect(selected.at(-1)?.phase).toBe("upload");
    expect(selected.filter((item) => item.phase === "download").length).toBeGreaterThan(
      30,
    );
    expect(selected.filter((item) => item.phase === "upload").length).toBeGreaterThan(
      30,
    );
  });
});

function sample(phase: SpeedSample["phase"], index: number): SpeedSample {
  return {
    phase,
    startedAtMs: index,
    endedAtMs: index + 1,
    durationMs: 1,
    bytes: 1,
    bitsPerSecond: (index + 1) * 1_000_000,
    warmup: false,
    workerBreakdown: [],
  };
}
