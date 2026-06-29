import type { SpeedTestResult, ThroughputResult } from "../results/resultTypes";
import type {
  CreateResultRecordOptions,
  RawSamplesPrivacy,
  SpeedTestResultRecord,
} from "./resultRecordTypes";

function stripThroughputSamples(
  result: ThroughputResult | null,
): ThroughputResult | null {
  if (!result) {
    return result;
  }
  const { samples: _samples, windows: _windows, ...rest } = result;
  return rest;
}

function hasRawSamples(result: SpeedTestResult): boolean {
  return Boolean(result.download?.samples?.length || result.upload?.samples?.length);
}

function cloneResult(result: SpeedTestResult, stripSamples: boolean): SpeedTestResult {
  if (!stripSamples) {
    return structuredClone(result);
  }
  return {
    ...structuredClone(result),
    download: stripThroughputSamples(result.download),
    upload: stripThroughputSamples(result.upload),
  };
}

export function createResultRecord<TContext = Record<string, unknown>>(
  result: SpeedTestResult,
  options: CreateResultRecordOptions<TContext> = {},
): SpeedTestResultRecord<TContext> {
  const stripSamples = options.rawSamples === "strip";
  const privacy: RawSamplesPrivacy = stripSamples
    ? "stripped"
    : hasRawSamples(result)
      ? "included"
      : "not-present";

  return {
    schemaVersion: "comet-result-record/v1",
    createdAt: options.createdAt ?? new Date().toISOString(),
    result: cloneResult(result, stripSamples),
    ...(options.selectedTarget ? { selectedTarget: options.selectedTarget } : {}),
    ...(options.context === undefined ? {} : { context: options.context }),
    privacy: { rawSamples: privacy },
  };
}
