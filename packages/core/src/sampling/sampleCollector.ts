import type { NormalizedSamplingConfig } from "@comet-speedtest/config";

import type { SpeedSample, ThroughputPhase } from "../results/resultTypes";

export interface ByteEvent {
  workerId: string;
  bytes: number;
  at: number;
}

export function bitsPerSecond(bytes: number, durationMs: number): number {
  return (bytes * 8 * 1000) / durationMs;
}

export class SampleCollector {
  private readonly buckets = new Map<string, number>();
  private readonly samples: SpeedSample[] = [];
  private lastSampleAt: number;
  private sampleIndex = 0;

  constructor(
    private readonly phase: ThroughputPhase,
    private readonly config: NormalizedSamplingConfig,
    startedAtMs: number,
  ) {
    this.lastSampleAt = startedAtMs;
  }

  record(event: ByteEvent): void {
    this.buckets.set(
      event.workerId,
      (this.buckets.get(event.workerId) ?? 0) + event.bytes,
    );
  }

  resetClock(startedAtMs: number): void {
    this.lastSampleAt = startedAtMs;
  }

  sample(now: number): SpeedSample {
    const workerBreakdown = [...this.buckets.entries()].map(([workerId, bytes]) => ({
      workerId,
      bytes,
    }));
    const bytes = workerBreakdown.reduce((sum, item) => sum + item.bytes, 0);
    const durationMs = Math.max(1, now - this.lastSampleAt);
    const sample: SpeedSample = {
      phase: this.phase,
      startedAtMs: this.lastSampleAt,
      endedAtMs: now,
      durationMs,
      bytes,
      bitsPerSecond: bitsPerSecond(bytes, durationMs),
      warmup:
        this.sampleIndex < this.config.warmupWindowCount * this.config.samplesPerWindow,
      workerBreakdown,
    };
    this.samples.push(sample);
    this.sampleIndex += 1;
    this.buckets.clear();
    this.lastSampleAt = now;
    return sample;
  }

  getSamples(): SpeedSample[] {
    return [...this.samples];
  }
}
