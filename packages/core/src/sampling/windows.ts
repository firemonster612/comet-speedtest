import type { NormalizedSamplingConfig } from "@comet-speedtest/config";

import type { SpeedSample, SpeedWindow, ThroughputPhase } from "../results/resultTypes";
import { percentile } from "./percentile";
import { bitsPerSecond } from "./sampleCollector";

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
    // Total bytes over total time, so a late timer's long sample weighs more
    // than a short one instead of each sample's rate counting equally.
    const bytes = chunk.reduce((sum, sample) => sum + sample.bytes, 0);
    const durationMs = chunk.reduce((sum, sample) => sum + sample.durationMs, 0);
    windows.push({
      phase,
      index: windows.length,
      sampleCount: chunk.length,
      startedAtMs: chunk[0]?.startedAtMs ?? 0,
      endedAtMs: chunk.at(-1)?.endedAtMs ?? 0,
      averageBitsPerSecond: bitsPerSecond(bytes, durationMs),
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
