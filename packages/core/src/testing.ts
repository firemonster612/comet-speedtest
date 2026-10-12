import type { DeterministicPhaseAdapter } from "./engine/phases";
import { SpeedTestEngine } from "./engine/SpeedTestEngine";
import type {
  CapabilityReport,
  SpeedTestConfig,
  SpeedTestEngine as SpeedTest,
} from "./results/resultTypes";

export interface TestSpeedTestOptions {
  baseUrl?: string;
  /**
   * With a `measurementAdapter`, defaults to a browser that supports every
   * transport. Without one the run uses the network, so it is detected.
   */
  capabilities?: CapabilityReport;
  measurementAdapter?: DeterministicPhaseAdapter;
}

/**
 * With an adapter standing in for the network, detection would report what the
 * test runtime supports (Node has no Workers), not the browser under test, so
 * tests start from a fully capable one and override fields to exercise
 * transport fallbacks. A fresh object per engine, because results expose it.
 */
function allCapabilities(): CapabilityReport {
  return {
    fetchResponseStreaming: true,
    fetchRequestStreaming: true,
    xhrUpload: true,
    workers: true,
    abortController: true,
  };
}

export function createTestSpeedTest(
  config: SpeedTestConfig,
  options: TestSpeedTestOptions = {},
): SpeedTest {
  const capabilities =
    options.capabilities ??
    (options.measurementAdapter ? allCapabilities() : undefined);
  return new SpeedTestEngine(config, {
    ...options,
    ...(capabilities ? { capabilities } : {}),
  });
}

export {
  PartialThroughputPhaseError,
  SyntheticMeasurementAdapter,
  type DeterministicPhaseAdapter,
  type IdleLatencyOptions,
  type PhaseEventSink,
  type PhaseOptions,
} from "./engine/phases";
export { SampleCollector } from "./sampling/sampleCollector";
