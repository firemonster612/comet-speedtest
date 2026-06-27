/** Shared display formatting for throughput and latency. */

export function mbps(bitsPerSecond: number | null): number | null {
  return bitsPerSecond === null ? null : bitsPerSecond / 1_000_000;
}

export interface SpeedParts {
  value: string;
  unit: "Mbps" | "Gbps";
}

/**
 * Always three significant digits, padded with trailing zeros: `368`, `36.0`,
 * `8.00`, `1.60`. The decimal places shrink as the integer part grows, so the
 * displayed precision stays consistent across the whole range (values with 3+
 * integer digits are shown whole). Never uses exponential notation.
 */
export function threeDigits(value: number): string {
  if (!Number.isFinite(value)) {
    return value.toFixed(0);
  }
  const abs = Math.abs(value);
  const integerDigits = abs < 1 ? 1 : Math.floor(Math.log10(abs)) + 1;
  return value.toFixed(Math.max(0, 3 - integerDigits));
}

/** Mbps under 1000, Gbps at gigabit scale, each to three significant digits. */
export function speedParts(bitsPerSecond: number | null): SpeedParts | null {
  const value = mbps(bitsPerSecond);
  if (value === null) {
    return null;
  }
  if (value >= 1000) {
    return { value: threeDigits(value / 1000), unit: "Gbps" };
  }
  return { value: threeDigits(value), unit: "Mbps" };
}

/** "742 Mbps" / "1.64 Gbps". */
export function speed(bitsPerSecond: number | null): string {
  const parts = speedParts(bitsPerSecond);
  if (parts === null) {
    return "-- Mbps";
  }
  return `${parts.value} ${parts.unit}`;
}

/** Just the number, for places that render the unit separately (the dial). */
export function speedValue(bitsPerSecond: number | null): string {
  const parts = speedParts(bitsPerSecond);
  if (parts === null) {
    return "--";
  }
  return parts.value;
}

export function latency(value: number | null): string {
  return value === null ? "-- ms" : `${threeDigits(value)} ms`;
}

const NICE_STEPS = [
  10, 25, 50, 100, 150, 250, 500, 750, 1000, 2500, 5000, 7500, 10_000,
];

/**
 * Rounds a peak Mbps up to a friendly dial/axis ceiling so the gauge arc and
 * the graph share one stable scale that only ever grows during a run.
 */
export function niceCeil(peakMbps: number): number {
  const target = Math.max(peakMbps * 1.05, 1);
  for (const step of NICE_STEPS) {
    if (target <= step) {
      return step;
    }
  }
  return Math.ceil(target / 10_000) * 10_000;
}
