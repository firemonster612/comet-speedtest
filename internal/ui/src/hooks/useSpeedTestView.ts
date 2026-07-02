import type { NormalizedSpeedTestConfig } from "@comet-speedtest/config";
import type {
  PartialResult,
  SpeedSample,
  SpeedTestResult,
  SpeedTestRunPhase,
  SpeedTestState,
} from "@comet-speedtest/core";
import { useMemo } from "react";

import type { ActivePhase, MetricValues } from "../components/MetricTiles";
import type { Tone } from "../components/PhaseLabel";
import { niceCeil } from "../lib/format";
import { rollingPercentileBitsPerSecond } from "../lib/rollingThroughput";

const PROGRESS_BOUNDS: Record<string, [number, number]> = {
  "idle-latency": [4, 12],
  download: [12, 54],
  upload: [54, 96],
  finalize: [96, 99],
};

const PHASE_ORDER = ["idle-latency", "download", "upload"] as const;

export interface SpeedTestHero {
  tone: Tone;
  label: string;
  value: number | null;
  secondaryLabel?: string;
  secondaryValue?: number | null;
}

export interface SpeedTestView {
  selectedPhases: SpeedTestRunPhase[];
  hero: SpeedTestHero;
  metrics: MetricValues;
  scaleMaxMbps: number;
  progress: number;
  activeTilePhase: ActivePhase;
}

/**
 * Turns engine state + the (normalized) config into the display-ready numbers
 * the widget renders: the hero readout, the metric tiles, the dial/graph scale,
 * and the progress estimate. Extracted from `SpeedTestWidget` so any second view
 * can reuse the same derivation rather than re-deriving it. Reads only the
 * normalized config, so there are no defaulting/`undefined` checks here.
 */
export function useSpeedTestView(input: {
  state: SpeedTestState;
  result: SpeedTestResult | null;
  partial: PartialResult | null;
  samples: SpeedSample[];
  config: NormalizedSpeedTestConfig;
  labels: { download: string; upload: string };
}): SpeedTestView {
  const { state, result, partial, samples, config, labels } = input;
  const { status, phase } = state;
  const sampling = config.test.sampling;
  const completed = partial?.completedPhases ?? null;

  const selectedPhases = useMemo<SpeedTestRunPhase[]>(() => {
    const selected = new Set(config.test.selection.phases);
    return PHASE_ORDER.filter((candidate) => selected.has(candidate));
  }, [config]);

  const liveDownloadBps = useMemo(
    () =>
      rollingPercentileBitsPerSecond(samples, "download", sampling.samplesPerWindow),
    [samples, sampling.samplesPerWindow],
  );
  const liveUploadBps = useMemo(
    () => rollingPercentileBitsPerSecond(samples, "upload", sampling.samplesPerWindow),
    [samples, sampling.samplesPerWindow],
  );

  // Headline metrics, resolved live during the run and frozen from the result
  // (or a partial run) afterwards so finished phases keep their numbers.
  const downloadBps =
    result?.download?.bitsPerSecond ??
    liveDownloadBps ??
    completed?.download?.bitsPerSecond ??
    null;
  const uploadBps =
    result?.upload?.bitsPerSecond ??
    liveUploadBps ??
    completed?.upload?.bitsPerSecond ??
    null;

  const liveLatency = state.latestLatencySample?.latencyMs ?? null;
  // Report the median, not the mean: it's the typical latency (a single spike
  // shouldn't define it) and — crucially — it's the same statistic the
  // bufferbloat grade and the connection-quality scorer use, so the number shown
  // and its grade can never disagree (e.g. a higher mean grading better than a
  // lower one because their medians flip).
  const idleLatencyMs =
    result?.latency.idle?.medianMs ??
    (phase === "idle-latency" ? liveLatency : null) ??
    completed?.idleLatency?.medianMs ??
    null;
  // The engine measures loaded latency separately per direction, so keep the
  // download and upload readings distinct rather than averaging them.
  const downloadLatencyMs =
    result?.latency.underDownloadLoad?.medianMs ??
    (phase === "download" ? liveLatency : null) ??
    completed?.underDownloadLoad?.medianMs ??
    null;
  const uploadLatencyMs =
    result?.latency.underUploadLoad?.medianMs ??
    (phase === "upload" ? liveLatency : null) ??
    completed?.underUploadLoad?.medianMs ??
    null;

  const scaleMaxMbps = useMemo(() => {
    const peak = Math.max(
      0,
      ...samples.map((sample) => sample.bitsPerSecond / 1_000_000),
      (downloadBps ?? 0) / 1_000_000,
      (uploadBps ?? 0) / 1_000_000,
    );
    return niceCeil(peak);
  }, [samples, downloadBps, uploadBps]);

  const expectedPerPhase =
    (sampling.warmupWindowCount + sampling.measuredWindowCount) *
    sampling.samplesPerWindow;

  const progress = useMemo(() => {
    if (status === "complete") {
      return 100;
    }
    if (status === "idle") {
      return 0;
    }
    const bounds = phase ? PROGRESS_BOUNDS[phase] : undefined;
    if (!phase || !bounds) {
      return 0;
    }
    const [lo, hi] = bounds;
    if (phase === "download" || phase === "upload") {
      const count = samples.filter((sample) => sample.phase === phase).length;
      const ratio = expectedPerPhase > 0 ? Math.min(1, count / expectedPerPhase) : 0;
      return Math.round(lo + (hi - lo) * ratio);
    }
    return lo;
  }, [status, phase, samples, expectedPerPhase]);

  const hero = resolveHero({
    status,
    phase,
    downloadLabel: labels.download,
    uploadLabel: labels.upload,
    liveDownloadBps,
    liveUploadBps,
    resultDownloadBps: result?.download?.bitsPerSecond ?? null,
    resultUploadBps: result?.upload?.bitsPerSecond ?? null,
  });

  const activeTilePhase: ActivePhase =
    status === "running" && phase !== "finalize" ? phase : null;

  return {
    selectedPhases,
    hero,
    metrics: {
      downloadBps,
      uploadBps,
      idleLatencyMs,
      downloadLatencyMs,
      uploadLatencyMs,
    },
    scaleMaxMbps,
    progress,
    activeTilePhase,
  };
}

function resolveHero({
  status,
  phase,
  downloadLabel,
  uploadLabel,
  liveDownloadBps,
  liveUploadBps,
  resultDownloadBps,
  resultUploadBps,
}: {
  status: string;
  phase: string | null;
  downloadLabel: string;
  uploadLabel: string;
  liveDownloadBps: number | null;
  liveUploadBps: number | null;
  resultDownloadBps: number | null;
  resultUploadBps: number | null;
}): SpeedTestHero {
  if (status === "running") {
    if (phase === "upload") {
      return { tone: "upload", label: uploadLabel, value: liveUploadBps };
    }
    if (phase === "download") {
      return { tone: "download", label: downloadLabel, value: liveDownloadBps };
    }
    return {
      tone: "idle",
      label:
        phase === "idle-latency"
          ? "Measuring latency"
          : phase === "finalize"
            ? "Finishing up"
            : "Getting ready",
      value: null,
    };
  }
  if (status === "complete" && resultDownloadBps !== null) {
    if (resultUploadBps === null) {
      return { tone: "download", label: downloadLabel, value: resultDownloadBps };
    }
    return {
      tone: "download",
      label: downloadLabel,
      value: resultDownloadBps,
      secondaryLabel: uploadLabel,
      secondaryValue: resultUploadBps,
    };
  }
  if (status === "complete" && resultUploadBps !== null) {
    return { tone: "upload", label: uploadLabel, value: resultUploadBps };
  }
  return { tone: "idle", label: downloadLabel, value: null };
}
