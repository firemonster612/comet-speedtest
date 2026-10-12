import type {
  LatencyResult,
  SpeedTestResult,
  ThroughputResult,
} from "../results/resultTypes";
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

function stripLatencySamples(result: LatencyResult | null): LatencyResult | null {
  return result && { ...result, samples: [] };
}

function hasRawSamples(result: SpeedTestResult): boolean {
  return Boolean(
    result.download?.samples?.length ||
    result.upload?.samples?.length ||
    Object.values(result.latency).some((latency) => latency?.samples.length),
  );
}

function stripRawSamples(result: SpeedTestResult): SpeedTestResult {
  const { idle, underDownloadLoad, underUploadLoad } = result.latency;
  return {
    ...result,
    download: stripThroughputSamples(result.download),
    upload: stripThroughputSamples(result.upload),
    latency: {
      idle: stripLatencySamples(idle),
      underDownloadLoad: stripLatencySamples(underDownloadLoad),
      underUploadLoad: stripLatencySamples(underUploadLoad),
    },
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
  const copy = structuredClone(result);

  return {
    schemaVersion: "comet-result-record/v1",
    createdAt: options.createdAt ?? new Date().toISOString(),
    result: stripSamples ? stripRawSamples(copy) : copy,
    ...(options.selectedTarget ? { selectedTarget: options.selectedTarget } : {}),
    ...(options.context === undefined ? {} : { context: options.context }),
    privacy: { rawSamples: privacy },
  };
}
