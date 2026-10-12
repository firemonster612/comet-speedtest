import type { DeterministicPhaseAdapter } from "./engine/phases";
import { SpeedTestEngine } from "./engine/SpeedTestEngine";
import type {
  CapabilityReport,
  SpeedTestConfig,
  SpeedTestEngine as SpeedTest,
} from "./results/resultTypes";

export interface TestSpeedTestOptions {
  baseUrl?: string;
  /** Defaults to a browser that supports every transport. */
  capabilities?: CapabilityReport;
  measurementAdapter?: DeterministicPhaseAdapter;
}

/**
 * Detection would report what the test runtime supports (Node has no Workers),
 * not the browser under test, so tests start from a fully capable one and
 * override fields to exercise transport fallbacks.
 */
const ALL_CAPABILITIES: CapabilityReport = {
  fetchResponseStreaming: true,
  fetchRequestStreaming: true,
  xhrUpload: true,
  workers: true,
  abortController: true,
};

export function createTestSpeedTest(
  config: SpeedTestConfig,
  options: TestSpeedTestOptions = {},
): SpeedTest {
  return new SpeedTestEngine(config, {
    ...options,
    capabilities: options.capabilities ?? ALL_CAPABILITIES,
  });
}

export {
  PartialThroughputPhaseError,
  SyntheticMeasurementAdapter,
  type DeterministicPhaseAdapter,
} from "./engine/phases";
export { SampleCollector } from "./sampling/sampleCollector";
