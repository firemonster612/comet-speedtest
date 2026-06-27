import { SpeedTestEngine } from "./engine/SpeedTestEngine";
import type {
  CapabilityReport,
  SpeedTestConfig,
  SpeedTestEngine as SpeedTest,
} from "./results/resultTypes";

export interface SpeedTestOptions {
  baseUrl?: string;
  capabilities?: CapabilityReport;
}

export function createSpeedTest(
  config: SpeedTestConfig,
  options?: SpeedTestOptions,
): SpeedTest {
  return new SpeedTestEngine(config, options);
}

export type * from "./results/resultTypes";
export { gradeBufferbloat } from "./results/bufferbloat";
export { compareAgainstPlan } from "./plans/compareAgainstPlan";
export type * from "./plans/planTypes";
export { scoreConnectionQuality } from "./quality/scoreConnectionQuality";
export type * from "./quality/qualityTypes";
export { createResultRecord } from "./records/createResultRecord";
export type * from "./records/resultRecordTypes";
