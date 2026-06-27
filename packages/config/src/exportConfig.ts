import type { NormalizedSpeedTestConfig, RuntimeConfig } from "./runtimeConfig";

export function exportConfig(
  config: NormalizedSpeedTestConfig | RuntimeConfig,
): string {
  const runtime: RuntimeConfig =
    "diagnostics" in config
      ? {
          brand: config.brand,
          theme: config.theme,
          content: config.content,
          targets: config.targets,
          targetProfiles: config.targetProfiles,
          targetSelection: config.targetSelection,
          test: config.test,
          result: config.result,
        }
      : config;
  return `${JSON.stringify(runtime, null, 2)}\n`;
}
