export type PlanComparisonStatus = "meets-plan" | "below-plan" | "unknown";

export interface PlanComparisonInput {
  downloadMbps?: number;
  uploadMbps?: number;
  acceptableRatio?: number;
}

export interface PlanComparisonResult {
  schemaVersion: "comet-plan-comparison/v1";
  status: PlanComparisonStatus;
  downloadRatio: number | null;
  uploadRatio: number | null;
  limitingMetrics: Array<"download" | "upload">;
  expected: {
    downloadMbps?: number;
    uploadMbps?: number;
  };
  measured: {
    downloadMbps: number | null;
    uploadMbps: number | null;
  };
}
