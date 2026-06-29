import type { NormalizedSamplingConfig } from "@comet-speedtest/config";

import type { SpeedSample, SpeedWindow, ThroughputPhase } from "../results/resultTypes";
import { percentile } from "./percentile";

export function buildWindows(
  phase: ThroughputPhase,
  samples: readonly SpeedSample[],
  config: NormalizedSamplingConfig,
): SpeedWindow[] {
  const windows: SpeedWindow[] = [];
  const sampleIndexes = samples.map((_, index) => index);
  const chunkSize = config.samplesPerWindow;
  for (let start = 0; start < samples.length; start += chunkSize) {
    const chunk = samples.slice(start, start + chunkSize);
    const ratio = chunk.length / chunkSize;
    if (chunk.length < chunkSize && ratio < config.includePartialWindowAtLeastRatio) {
      continue;
    }
    const totalBitsPerSecond = chunk.reduce(
      (sum, sample) => sum + sample.bitsPerSecond,
      0,
    );
    windows.push({
      phase,
      index: windows.length,
      sampleCount: chunk.length,
      startedAtMs: chunk[0]?.startedAtMs ?? 0,
      endedAtMs: chunk.at(-1)?.endedAtMs ?? 0,
      averageBitsPerSecond: chunk.length > 0 ? totalBitsPerSecond / chunk.length : 0,
      sampleIndexes: sampleIndexes.slice(start, start + chunk.length),
      warmup: windows.length < config.warmupWindowCount,
    });
  }
  return windows;
}

export function finalBitsPerSecond(
  windows: readonly SpeedWindow[],
  config: NormalizedSamplingConfig,
): number {
  const measured = windows
    .filter((window) => !window.warmup)
    .slice(0, config.measuredWindowCount)
    .map((window) => window.averageBitsPerSecond);
  return percentile(measured, config.percentile);
}
