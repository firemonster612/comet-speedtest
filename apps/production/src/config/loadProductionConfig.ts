import { loadAndNormalizeConfig } from "@lightspeed/config";

export async function loadProductionConfig(signal?: AbortSignal) {
  return loadAndNormalizeConfig({
    url: "/lightspeed.config.json",
    ...(signal ? { signal } : {}),
  });
}
