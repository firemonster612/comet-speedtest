import type { SpeedSample } from "@lightspeed/core";

export function selectChartSamples(
  samples: readonly SpeedSample[],
  maxPoints: number,
): SpeedSample[] {
  if (samples.length <= maxPoints) {
    return [...samples];
  }
  const pointCount = Math.max(2, Math.floor(maxPoints));
  const lastIndex = samples.length - 1;
  const selected: SpeedSample[] = [];
  let previousIndex = -1;

  for (let index = 0; index < pointCount; index += 1) {
    const sampleIndex = Math.round((index * lastIndex) / (pointCount - 1));
    if (sampleIndex !== previousIndex) {
      selected.push(samples[sampleIndex] as SpeedSample);
      previousIndex = sampleIndex;
    }
  }

  return selected;
}
