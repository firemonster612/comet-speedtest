import type { SpeedSample } from "@lightspeed/core";
import { percentile } from "@lightspeed/core/diagnostics";

const LIVE_THROUGHPUT_PERCENTILE = 75;

export function rollingPercentileBitsPerSecond(
  samples: readonly SpeedSample[],
  phase: SpeedSample["phase"],
  windowSize: number,
): number | null {
  const window = samples
    .filter((sample) => sample.phase === phase)
    .slice(-Math.max(1, Math.floor(windowSize)));
  if (window.length === 0) {
    return null;
  }
  return percentile(
    window.map((sample) => sample.bitsPerSecond),
    LIVE_THROUGHPUT_PERCENTILE,
  );
}
