import type { DeterministicPhaseAdapter } from "./engine/phases";
import { SpeedTestEngine } from "./engine/SpeedTestEngine";
import type {
  CapabilityReport,
  SpeedTestConfig,
  SpeedTestEngine as SpeedTest,
} from "./results/resultTypes";

export interface TestSpeedTestOptions {
  baseUrl?: string;
  capabilities?: CapabilityReport;
  measurementAdapter?: DeterministicPhaseAdapter;
}

export function createTestSpeedTest(
  config: SpeedTestConfig,
  options: TestSpeedTestOptions = {},
): SpeedTest {
  return new SpeedTestEngine(config, options);
}

export {
  PartialThroughputPhaseError,
  SyntheticMeasurementAdapter,
  type DeterministicPhaseAdapter,
} from "./engine/phases";
export { SampleCollector } from "./sampling/sampleCollector";
