import { loadAndNormalizeConfig } from "@comet-speedtest/config";

export async function loadProductionConfig(signal?: AbortSignal) {
  return loadAndNormalizeConfig({
    url: "/comet.config.json",
    ...(signal ? { signal } : {}),
  });
}
