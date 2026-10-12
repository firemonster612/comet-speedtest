import type { SpeedTestResult } from "../results/resultTypes";
import type {
  ConnectionQualityResult,
  QualityLimitingFactor,
  QualityScore,
} from "./qualityTypes";

interface MetricScore {
  score: number | null;
  factor: QualityLimitingFactor;
  /** How a missing input is named in an "unknown" explanation. */
  name: string;
}

type ScoredMetric = MetricScore & { score: number };

const FACTOR_NAMES: Record<QualityLimitingFactor, string> = {
  download: "download speed",
  upload: "upload speed",
  "idle-latency": "idle latency",
  "loaded-latency": "loaded latency",
  bufferbloat: "bufferbloat",
  jitter: "jitter",
};

const metric = (factor: QualityLimitingFactor, score: number | null): MetricScore => ({
  score,
  factor,
  name: FACTOR_NAMES[factor],
});

const isScored = <T extends MetricScore>(item: T): item is T & ScoredMetric =>
  item.score !== null;

const bitsToMbps = (bitsPerSecond: number | null | undefined): number | null =>
  typeof bitsPerSecond === "number" ? bitsPerSecond / 1_000_000 : null;

/** The largest of the measured values, or `null` when none was measured. */
function worst(values: Array<number | null | undefined>): number | null {
  const measured = values.filter((value): value is number => typeof value === "number");
  return measured.length > 0 ? Math.max(...measured) : null;
}

const lowest = (scores: ScoredMetric[]): ScoredMetric | null =>
  [...scores].sort((a, b) => a.score - b.score)[0] ?? null;

function higherIsBetter(
  value: number | null,
  factor: QualityLimitingFactor,
  thresholds: [poor: number, fair: number, good: number, excellent: number],
): MetricScore {
  if (value === null) {
    return metric(factor, null);
  }
  const [poor, fair, good, excellent] = thresholds;
  if (value >= excellent) {
    return metric(factor, 100);
  }
  if (value >= good) {
    return metric(factor, 85);
  }
  if (value >= fair) {
    return metric(factor, 70);
  }
  if (value >= poor) {
    return metric(factor, 45);
  }
  return metric(factor, 20);
}

function lowerIsBetter(
  value: number | null,
  factor: QualityLimitingFactor,
  thresholds: [excellent: number, good: number, fair: number, poor: number],
): MetricScore {
  if (value === null) {
    return metric(factor, null);
  }
  const [excellent, good, fair, poor] = thresholds;
  if (value <= excellent) {
    return metric(factor, 100);
  }
  if (value <= good) {
    return metric(factor, 85);
  }
  if (value <= fair) {
    return metric(factor, 65);
  }
  if (value <= poor) {
    return metric(factor, 40);
  }
  return metric(factor, 15);
}

function gradeFor(score: number | null): QualityScore["grade"] {
  if (score === null) {
    return "unknown";
  }
  if (score >= 90) {
    return "excellent";
  }
  if (score >= 75) {
    return "good";
  }
  if (score >= 50) {
    return "fair";
  }
  return "poor";
}

/** Every input is required: a score from a subset of them would overstate quality. */
function weightedScore(
  scores: Array<MetricScore & { weight: number }>,
  label: string,
): QualityScore {
  const present = scores.filter(isScored);
  if (present.length < scores.length) {
    const missing = scores.filter((item) => !isScored(item)).map((item) => item.name);
    return {
      score: null,
      grade: "unknown",
      limitingFactors: [],
      explanation: `${label} quality is unknown because the run did not produce: ${missing.join(", ")}.`,
    };
  }

  const totalWeight = present.reduce((total, item) => total + item.weight, 0);
  const score = Math.round(
    present.reduce((total, item) => total + item.score * item.weight, 0) / totalWeight,
  );
  const weakest = lowest(present);
  const weakestScore = weakest?.score ?? null;
  const limitingFactors =
    weakestScore !== null && weakestScore < 75
      ? present
          .filter((item) => item.score <= weakestScore + 10)
          .map((item) => item.factor)
      : [];
  const grade = gradeFor(score);

  return {
    score,
    grade,
    limitingFactors,
    explanation:
      limitingFactors.length > 0
        ? `${label} quality is ${grade}; limited by ${limitingFactors.join(", ")}.`
        : `${label} quality is ${grade}; no major limiting factor was detected.`,
  };
}

export function scoreConnectionQuality(
  result: SpeedTestResult,
): ConnectionQualityResult {
  const { idle, underDownloadLoad, underUploadLoad } = result.latency;
  const inputs = {
    downloadMbps: bitsToMbps(result.download?.bitsPerSecond),
    uploadMbps: bitsToMbps(result.upload?.bitsPerSecond),
    idleLatencyMs: idle?.medianMs ?? null,
    // Read from the loaded buckets, not `bufferbloat`: only bufferbloat needs the
    // idle baseline.
    loadedLatencyMs: worst([underDownloadLoad?.medianMs, underUploadLoad?.medianMs]),
    addedLatencyMs: result.bufferbloat.addedLatencyMs,
    jitterMs: worst([
      idle?.jitterMs,
      underDownloadLoad?.jitterMs,
      underUploadLoad?.jitterMs,
    ]),
    bufferbloatGrade: result.bufferbloat.grade,
  };

  const download = higherIsBetter(inputs.downloadMbps, "download", [5, 25, 100, 250]);
  const upload = higherIsBetter(inputs.uploadMbps, "upload", [2, 10, 25, 100]);
  const idleLatency = lowerIsBetter(
    inputs.idleLatencyMs,
    "idle-latency",
    [20, 50, 100, 180],
  );
  const loadedLatency = lowerIsBetter(
    inputs.loadedLatencyMs,
    "loaded-latency",
    [50, 100, 180, 300],
  );
  const jitter = lowerIsBetter(inputs.jitterMs, "jitter", [5, 15, 30, 60]);
  const bufferbloat = lowerIsBetter(
    inputs.addedLatencyMs,
    "bufferbloat",
    [20, 50, 100, 200],
  );

  const webBrowsing = weightedScore(
    [
      { ...loadedLatency, weight: 4 },
      { ...idleLatency, weight: 3 },
      { ...download, weight: 2 },
      { ...bufferbloat, weight: 1 },
    ],
    "Web browsing",
  );
  const gaming = weightedScore(
    [
      { ...idleLatency, weight: 3 },
      { ...loadedLatency, weight: 3 },
      { ...jitter, weight: 2 },
      { ...download, weight: 1 },
      { ...upload, weight: 1 },
      { ...bufferbloat, weight: 2 },
    ],
    "Gaming",
  );
  const streaming = weightedScore(
    [
      { ...download, weight: 5 },
      { ...loadedLatency, weight: 1 },
      { ...jitter, weight: 1 },
    ],
    "Streaming",
  );
  const videoCalling = weightedScore(
    [
      { ...upload, weight: 3 },
      { ...download, weight: 2 },
      { ...loadedLatency, weight: 3 },
      { ...jitter, weight: 2 },
    ],
    "Video calling",
  );
  const overall = weightedScore(
    [
      {
        score: webBrowsing.score,
        factor: "loaded-latency",
        name: "web browsing",
        weight: 1,
      },
      { score: gaming.score, factor: "loaded-latency", name: "gaming", weight: 1 },
      { score: streaming.score, factor: "download", name: "streaming", weight: 1 },
      {
        score: videoCalling.score,
        factor: "upload",
        name: "video calling",
        weight: 1,
      },
    ],
    "Overall",
  );

  return {
    schemaVersion: "comet-quality/v1",
    overall,
    webBrowsing,
    gaming,
    streaming,
    videoCalling,
    inputs,
  };
}
