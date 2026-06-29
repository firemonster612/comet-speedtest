import type { NormalizedLatencyConfig } from "@comet-speedtest/config";

import type { LatencyResult, LatencySample } from "../results/resultTypes";
import { percentile } from "../sampling/percentile";

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Single collection path for latency samples, shared by the idle probe and the
 * loaded-latency worker. Both feed raw {@link LatencySample}s here; appending,
 * forwarding to the optional listener, and aggregation all happen in one place
 * so the two phases cannot diverge in how they assemble a {@link LatencyResult}.
 */
export class LatencyCollector {
  private readonly samples: LatencySample[] = [];

  constructor(private readonly emit?: (sample: LatencySample) => void) {}

  record(sample: LatencySample): LatencySample {
    this.samples.push(sample);
    this.emit?.(sample);
    return sample;
  }

  aggregate(): LatencyResult {
    return aggregateLatency(this.samples);
  }

  get count(): number {
    return this.samples.length;
  }
}

export function aggregateLatency(samples: readonly LatencySample[]): LatencyResult {
  // `successful` keeps chronological order for jitter (consecutive deltas);
  // `sorted` is a separate copy for the order-statistics below.
  const successful = samples
    .filter((sample) => sample.ok)
    .map((sample) => sample.latencyMs);
  const sorted = [...successful].sort((a, b) => a - b);
  const mean =
    sorted.length > 0
      ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length
      : null;
  return {
    meanMs: mean,
    medianMs: sorted.length > 0 ? percentile(sorted, 50) : null,
    minMs: sorted[0] ?? null,
    maxMs: sorted.at(-1) ?? null,
    p95Ms: sorted.length > 0 ? percentile(sorted, 95) : null,
    jitterMs: meanAbsoluteConsecutiveDelta(successful),
    samples: [...samples],
  };
}

/** RFC 3393 IPDV: mean of |x[i] - x[i-1]| over the chronological series. */
function meanAbsoluteConsecutiveDelta(values: readonly number[]): number | null {
  if (values.length < 2) {
    return null;
  }
  let total = 0;
  for (let index = 1; index < values.length; index += 1) {
    total += Math.abs((values[index] as number) - (values[index - 1] as number));
  }
  return total / (values.length - 1);
}

export async function runIdleLatency(
  target: string,
  config: NormalizedLatencyConfig,
  emit: (sample: LatencySample) => void,
  signal: AbortSignal,
): Promise<LatencyResult> {
  if (!config.enabled || config.idleRequests === 0) {
    return aggregateLatency([]);
  }

  const collector = new LatencyCollector(emit);
  for (let index = 0; index < config.idleRequests; index += 1) {
    if (signal.aborted) {
      throw new Error("Run aborted");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    const startedAtMs = nowMs();
    try {
      const combinedSignal = combineAbortSignals(signal, controller.signal);
      const response = await fetch(target, {
        method: config.method,
        cache: "no-store",
        signal: combinedSignal,
      });
      const endedAtMs = nowMs();
      collector.record({
        phase: "idle",
        startedAtMs,
        endedAtMs,
        latencyMs: endedAtMs - startedAtMs,
        ok: response.ok,
      });
    } catch {
      if (signal.aborted) {
        throw new Error("Run aborted");
      }
      const endedAtMs = nowMs();
      collector.record({
        phase: "idle",
        startedAtMs,
        endedAtMs,
        latencyMs: endedAtMs - startedAtMs,
        ok: false,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
  return collector.aggregate();
}

export interface ReachabilityResult {
  /** True only when a response (any status) actually came back. */
  reachable: boolean;
  status?: number;
  /** Set when the target could not be reached at all (network error / timeout). */
  reason?: string;
}

/**
 * A single fast connectivity probe, used as a pre-flight gate before the run.
 * It only reports *unreachable* for a true connection failure — a network error
 * (server down / DNS / CORS) or no response within the timeout (a hung, dropped
 * connection). A response with a non-2xx status is still "reachable": the server
 * answered, so the throughput phases (and their own error handling) decide what
 * that endpoint is worth. This keeps the gate from false-failing a setup whose
 * latency endpoint 404s while its download/upload endpoints work.
 */
export async function probeReachability(
  target: string,
  config: NormalizedLatencyConfig,
  signal: AbortSignal,
): Promise<ReachabilityResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const combinedSignal = combineAbortSignals(signal, controller.signal);
    const response = await fetch(target, {
      method: config.method,
      cache: "no-store",
      signal: combinedSignal,
    });
    return { reachable: true, status: response.status };
  } catch (error) {
    if (signal.aborted) {
      throw new Error("Run aborted");
    }
    const reason = controller.signal.aborted
      ? `no response within ${config.timeoutMs} ms`
      : error instanceof Error
        ? error.message
        : String(error);
    return { reachable: false, reason };
  } finally {
    clearTimeout(timeout);
  }
}

function combineAbortSignals(
  primary: AbortSignal,
  secondary: AbortSignal,
): AbortSignal {
  if ("any" in AbortSignal) {
    return AbortSignal.any([primary, secondary]);
  }
  if (primary.aborted) {
    return primary;
  }
  if (secondary.aborted) {
    return secondary;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  primary.addEventListener("abort", abort, { once: true });
  secondary.addEventListener("abort", abort, { once: true });
  return controller.signal;
}
