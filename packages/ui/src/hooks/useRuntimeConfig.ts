import {
  loadAndNormalizeConfig,
  type NormalizedSpeedTestConfig,
} from "@lightspeed/config";
import { useEffect, useState } from "react";

export function useRuntimeConfig(url = "/lightspeed.config.json"): {
  config: NormalizedSpeedTestConfig | null;
  loading: boolean;
  error: Error | null;
} {
  const [config, setConfig] = useState<NormalizedSpeedTestConfig | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadAndNormalizeConfig({ url, source: url, signal: controller.signal })
      .then((config) => {
        setConfig(config);
        setError(null);
      })
      .catch((nextError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            nextError instanceof Error ? nextError : new Error(String(nextError)),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [url]);

  return { config, loading, error };
}
