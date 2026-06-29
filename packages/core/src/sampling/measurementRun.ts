import type { NormalizedSamplingConfig } from "@comet-speedtest/config";

import type {
  SpeedSample,
  SpeedWindow,
  ThroughputPhase,
  ThroughputResult,
} from "../results/resultTypes";
import { type ByteEvent, SampleCollector } from "./sampleCollector";
import { buildWindows, finalBitsPerSecond } from "./windows";

/** A monotonic millisecond clock. Injected so the pipeline is deterministic in tests. */
export type Clock = () => number;

export interface ThroughputAssembly {
  throughput: ThroughputResult;
  samples: SpeedSample[];
  windows: SpeedWindow[];
}

/**
 * Owns the whole "bytes become a final Mbps number" pipeline for one throughput
 * phase: per-worker byte accumulation, interval sampling, windowing, and the
 * percentile-based {@link ThroughputResult} assembly.
 *
 * Previously this sequence was inlined twice (the live worker phase and the
 * synthetic adapter) and tied to `performance.now()`. Concentrating it here
 * behind a small interface — with the clock injected — means the assembly lives
 * in one place and late-sample / warmup / percentile behavior is testable
 * without real timers.
 */
export class MeasurementRun {
  private readonly collector: SampleCollector;

  constructor(
    private readonly phase: ThroughputPhase,
    private readonly sampling: NormalizedSamplingConfig,
    private readonly includeRawSamples: boolean,
    private readonly clock: Clock,
  ) {
    this.collector = new SampleCollector(phase, sampling, clock());
  }

  /** Total interval samples a complete run expects (warmup + measured windows). */
  get totalSamples(): number {
    return (
      (this.sampling.warmupWindowCount + this.sampling.measuredWindowCount) *
      this.sampling.samplesPerWindow
    );
  }

  record(event: ByteEvent): void {
    this.collector.record(event);
  }

  resetClock(at: number = this.clock()): void {
    this.collector.resetClock(at);
  }

  sample(at: number = this.clock()): SpeedSample {
    return this.collector.sample(at);
  }

  /** Build the windows and final percentile result from everything recorded so far. */
  finish(): ThroughputAssembly {
    const samples = this.collector.getSamples();
    const windows = buildWindows(this.phase, samples, this.sampling);
    const throughput: ThroughputResult = {
      bitsPerSecond: finalBitsPerSecond(windows, this.sampling),
      bytesTransferred: samples.reduce((sum, sample) => sum + sample.bytes, 0),
      durationMs: samples.reduce((sum, sample) => sum + sample.durationMs, 0),
      percentile: this.sampling.percentile,
      sampleIntervalMs: this.sampling.intervalMs,
      samplesPerWindow: this.sampling.samplesPerWindow,
      measuredWindowCount: this.sampling.measuredWindowCount,
      warmupWindowCount: this.sampling.warmupWindowCount,
      windows,
    };
    if (this.includeRawSamples) {
      throughput.samples = samples;
    }
    return { throughput, samples, windows };
  }
}
