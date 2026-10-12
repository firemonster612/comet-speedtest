import { RuntimeConfigError } from "./configErrors";
import { normalizeConfig } from "./normalize";
import type { NormalizedSpeedTestConfig, RuntimeConfig } from "./runtimeConfig";

export async function loadRuntimeConfig(
  options: { url?: string; signal?: AbortSignal } = {},
): Promise<RuntimeConfig> {
  const url = options.url ?? "/comet.config.json";
  const init: RequestInit = {
    headers: { accept: "application/json" },
  };
  if (options.signal) {
    init.signal = options.signal;
  }
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    // A caller's abort is intentional, not a load failure; let it through as-is.
    if (options.signal?.aborted) {
      throw error;
    }
    throw new RuntimeConfigError(
      "config-load-failed",
      `Failed to load runtime config from ${url}: the request did not complete (network error, CORS, or server unreachable).`,
      { cause: error, diagnostics: { url } },
    );
  }
  if (!response.ok) {
    throw new RuntimeConfigError(
      "config-load-failed",
      `Failed to load runtime config from ${url}: ${response.status}`,
      { diagnostics: { url, status: response.status } },
    );
  }
  try {
    return (await response.json()) as RuntimeConfig;
  } catch (error) {
    if (options.signal?.aborted) {
      throw error;
    }
    throw new RuntimeConfigError(
      "config-load-failed",
      `Runtime config from ${url} is not valid JSON.`,
      {
        cause: error,
        diagnostics: { url },
      },
    );
  }
}

/**
 * Fetch a runtime config and normalize it in one step.
 *
 * This is the single home for the load-then-normalize sequence that both the
 * production app and the {@link useRuntimeConfig}-style consumers need, so the
 * chain is not re-implemented per call site. `source` defaults to the URL.
 */
export async function loadAndNormalizeConfig(
  options: {
    url?: string;
    source?: string;
    baseUrl?: string;
    signal?: AbortSignal;
    strict?: boolean;
  } = {},
): Promise<NormalizedSpeedTestConfig> {
  const url = options.url ?? "/comet.config.json";
  const load: { url: string; signal?: AbortSignal } = { url };
  if (options.signal) {
    load.signal = options.signal;
  }
  const runtime = await loadRuntimeConfig(load);
  const baseUrl =
    options.baseUrl ??
    (typeof location === "undefined" ? "http://localhost/" : location.href);
  return normalizeConfig(runtime, {
    source: options.source ?? url,
    baseUrl,
    ...(options.strict === undefined ? {} : { strict: options.strict }),
  });
}
