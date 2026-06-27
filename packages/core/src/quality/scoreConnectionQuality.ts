import type { SpeedTestResult } from "../results/resultTypes";
import type {
  ConnectionQualityResult,
  QualityLimitingFactor,
  QualityScore,
} from "./qualityTypes";

interface MetricScore {
  score: number | null;
  factor: QualityLimitingFactor;
}

const bitsToMbps = (bitsPerSecond: number | null | undefined): number | null =>
  typeof bitsPerSecond === "number" ? bitsPerSecond / 1_000_000 : null;

const lowest = (scores: MetricScore[]): MetricScore | null =>
  scores
    .filter(
      (item): item is { score: number; factor: QualityLimitingFactor } =>
        item.score !== null,
    )
    .sort((a, b) => a.score - b.score)[0] ?? null;

function higherIsBetter(
  value: number | null,
  factor: QualityLimitingFactor,
  thresholds: [poor: number, fair: number, good: number, excellent: number],
): MetricScore {
  if (value === null) {
    return { score: null, factor };
  }
  const [poor, fair, good, excellent] = thresholds;
  if (value >= excellent) {
    return { score: 100, factor };
  }
  if (value >= good) {
    return { score: 85, factor };
  }
  if (value >= fair) {
    return { score: 70, factor };
  }
  if (value >= poor) {
    return { score: 45, factor };
  }
  return { score: 20, factor };
}

function lowerIsBetter(
  value: number | null,
  factor: QualityLimitingFactor,
  thresholds: [excellent: number, good: number, fair: number, poor: number],
): MetricScore {
  if (value === null) {
    return { score: null, factor };
  }
  const [excellent, good, fair, poor] = thresholds;
  if (value <= excellent) {
    return { score: 100, factor };
  }
  if (value <= good) {
    return { score: 85, factor };
  }
  if (value <= fair) {
    return { score: 65, factor };
  }
  if (value <= poor) {
    return { score: 40, factor };
  }
  return { score: 15, factor };
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

function weightedScore(
  scores: Array<MetricScore & { weight: number }>,
  label: string,
): QualityScore {
  const present = scores.filter(
    (
      score,
    ): score is { score: number; factor: QualityLimitingFactor; weight: number } =>
      score.score !== null,
  );
  if (present.length === 0) {
    return {
      score: null,
      grade: "unknown",
      limitingFactors: [],
      explanation: `${label} quality is unknown because the run did not produce the required inputs.`,
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
  const idleLatencyMs = result.latency.idle?.medianMs ?? null;
  const loadedLatencyMs = result.bufferbloat.loadedLatencyMs;
  const idleJitterMs = result.latency.idle?.jitterMs ?? null;
  const loadedJitterMs = Math.max(
    result.latency.underDownloadLoad?.jitterMs ?? 0,
    result.latency.underUploadLoad?.jitterMs ?? 0,
  );
  const jitterMs =
    idleJitterMs === null && loadedJitterMs === 0
      ? null
      : Math.max(idleJitterMs ?? 0, loadedJitterMs);
  const inputs = {
    downloadMbps: bitsToMbps(result.download?.bitsPerSecond),
    uploadMbps: bitsToMbps(result.upload?.bitsPerSecond),
    idleLatencyMs,
    loadedLatencyMs,
    addedLatencyMs: result.bufferbloat.addedLatencyMs,
    jitterMs,
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
      { score: webBrowsing.score, factor: "loaded-latency", weight: 1 },
      { score: gaming.score, factor: "loaded-latency", weight: 1 },
      { score: streaming.score, factor: "download", weight: 1 },
      { score: videoCalling.score, factor: "upload", weight: 1 },
    ],
    "Overall",
  );

  return {
    schemaVersion: "lightspeed-quality/v1",
    overall,
    webBrowsing,
    gaming,
    streaming,
    videoCalling,
    inputs,
  };
}
