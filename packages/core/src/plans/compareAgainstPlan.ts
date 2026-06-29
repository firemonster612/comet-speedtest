import type { SpeedTestResult } from "../results/resultTypes";
import type { PlanComparisonInput, PlanComparisonResult } from "./planTypes";

const bitsToMbps = (bitsPerSecond: number | null | undefined): number | null =>
  typeof bitsPerSecond === "number" ? bitsPerSecond / 1_000_000 : null;

function ratio(measured: number | null, expected: number | undefined): number | null {
  if (expected === undefined) {
    return null;
  }
  if (measured === null || expected <= 0) {
    return null;
  }
  return measured / expected;
}

export function compareAgainstPlan(
  result: SpeedTestResult,
  plan: PlanComparisonInput,
): PlanComparisonResult {
  const acceptableRatio = plan.acceptableRatio ?? 0.8;
  const measured = {
    downloadMbps: bitsToMbps(result.download?.bitsPerSecond),
    uploadMbps: bitsToMbps(result.upload?.bitsPerSecond),
  };
  const downloadRatio = ratio(measured.downloadMbps, plan.downloadMbps);
  const uploadRatio = ratio(measured.uploadMbps, plan.uploadMbps);
  const requiredRatios = [
    ...(plan.downloadMbps === undefined
      ? []
      : [{ metric: "download" as const, ratio: downloadRatio }]),
    ...(plan.uploadMbps === undefined
      ? []
      : [{ metric: "upload" as const, ratio: uploadRatio }]),
  ];
  const hasExpected = requiredRatios.length > 0;
  const hasUnknownRequired = requiredRatios.some((item) => item.ratio === null);
  const limitingMetrics = requiredRatios
    .filter(
      (item): item is { metric: "download" | "upload"; ratio: number } =>
        item.ratio !== null && item.ratio < acceptableRatio,
    )
    .map((item) => item.metric);

  return {
    schemaVersion: "comet-plan-comparison/v1",
    status:
      !hasExpected || hasUnknownRequired
        ? "unknown"
        : limitingMetrics.length > 0
          ? "below-plan"
          : "meets-plan",
    downloadRatio,
    uploadRatio,
    limitingMetrics,
    expected: {
      ...(plan.downloadMbps === undefined ? {} : { downloadMbps: plan.downloadMbps }),
      ...(plan.uploadMbps === undefined ? {} : { uploadMbps: plan.uploadMbps }),
    },
    measured,
  };
}
