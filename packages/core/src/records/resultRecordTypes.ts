import type { SpeedTestResult } from "../results/resultTypes";
import type { TargetProfileSummary } from "../targets/targetTypes";

export type RawSamplesPolicy = "preserve" | "strip";
export type RawSamplesPrivacy = "included" | "stripped" | "not-present";

export interface CreateResultRecordOptions<TContext = Record<string, unknown>> {
  selectedTarget?: TargetProfileSummary;
  context?: TContext;
  rawSamples?: RawSamplesPolicy;
  createdAt?: string;
}

export interface SpeedTestResultRecord<TContext = Record<string, unknown>> {
  schemaVersion: "lightspeed-result-record/v1";
  createdAt: string;
  result: SpeedTestResult;
  selectedTarget?: TargetProfileSummary;
  context?: TContext;
  privacy: {
    rawSamples: RawSamplesPrivacy;
  };
}
