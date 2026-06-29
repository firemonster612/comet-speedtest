import type { BufferbloatGrade } from "../results/resultTypes";

export type QualityGrade = "excellent" | "good" | "fair" | "poor" | "unknown";
export type QualityLimitingFactor =
  | "download"
  | "upload"
  | "idle-latency"
  | "loaded-latency"
  | "bufferbloat"
  | "jitter";

export interface QualityScore {
  score: number | null;
  grade: QualityGrade;
  limitingFactors: QualityLimitingFactor[];
  explanation: string;
}

export interface ConnectionQualityResult {
  schemaVersion: "comet-quality/v1";
  overall: QualityScore;
  webBrowsing: QualityScore;
  gaming: QualityScore;
  streaming: QualityScore;
  videoCalling: QualityScore;
  inputs: {
    downloadMbps: number | null;
    uploadMbps: number | null;
    idleLatencyMs: number | null;
    loadedLatencyMs: number | null;
    addedLatencyMs: number | null;
    jitterMs: number | null;
    bufferbloatGrade: BufferbloatGrade | null;
  };
}
