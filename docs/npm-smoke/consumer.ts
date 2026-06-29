import { normalizeConfig, validateConfig } from "@comet-speedtest/config";
import {
  createResultRecord,
  createSpeedTest,
  gradeBufferbloat,
  type SpeedTestResult,
} from "@comet-speedtest/core";
import { selectTarget } from "@comet-speedtest/core/diagnostics";
import {
  createTestSpeedTest,
  SyntheticMeasurementAdapter,
} from "@comet-speedtest/core/testing";

const config = normalizeConfig({
  targets: {
    download: "/speedtest/download/large.bin",
    upload: "/speedtest/upload",
  },
});

const validation = validateConfig(config);
if (!validation.ok) {
  throw new Error("config should validate");
}

const engine = createSpeedTest(config);
const testEngine = createTestSpeedTest(config, {
  measurementAdapter: new SyntheticMeasurementAdapter(),
});

void engine.getState();
void testEngine.getConfig();
void gradeBufferbloat({
  idle: null,
  underDownloadLoad: null,
  underUploadLoad: null,
});
void selectTarget({
  targets: [
    {
      id: "local",
      targets: config.targets,
    },
  ],
  strategy: "forced",
  targetId: "local",
});

declare const result: SpeedTestResult;
void createResultRecord(result);
