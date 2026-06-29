import type { NormalizedSpeedTestConfig } from "@comet-speedtest/config";

import type {
  CapabilityReport,
  SpeedTestError,
  ThroughputPhase,
} from "../results/resultTypes";

export interface ResolvedTransports {
  actual: Record<ThroughputPhase, "fetch-stream" | "xhr-chunked" | null>;
  requested: Record<ThroughputPhase, string | null>;
  fallbackReasons: string[];
}

export function resolveTransports(
  config: NormalizedSpeedTestConfig,
  capabilities: CapabilityReport,
  options: { phases?: readonly ThroughputPhase[] } = {},
): ResolvedTransports {
  const fallbackReasons: string[] = [];
  const selected = new Set(options.phases ?? (["download", "upload"] as const));
  const requested = {
    download: selected.has("download") ? config.test.download.transport : null,
    upload: selected.has("upload") ? config.test.upload.transport : null,
  };

  if (selected.size > 0 && !capabilities.workers) {
    throw transportError(
      "worker-start-failed",
      "Web Workers are required for measurement.",
    );
  }
  if (!capabilities.abortController) {
    throw transportError("transport-unsupported", "AbortController is required.");
  }
  if (selected.has("download") && !capabilities.fetchResponseStreaming) {
    throw transportError(
      "transport-unsupported",
      "Fetch response streaming is required for download.",
    );
  }

  let upload: "fetch-stream" | "xhr-chunked" | null = null;
  const uploadPreference = config.test.upload.transport;
  if (!selected.has("upload")) {
    upload = null;
  } else if (uploadPreference === "xhr-chunked") {
    if (!capabilities.xhrUpload) {
      throw transportError("transport-unsupported", "XHR upload is not supported.");
    }
    upload = "xhr-chunked";
  } else if (uploadPreference === "fetch-stream") {
    if (capabilities.fetchRequestStreaming) {
      upload = "fetch-stream";
    } else if (config.test.upload.allowFallback && capabilities.xhrUpload) {
      upload = "xhr-chunked";
      fallbackReasons.push(
        "fetch upload streaming unsupported; fell back to xhr-chunked",
      );
    } else {
      throw transportError(
        "transport-unsupported",
        "Fetch upload streaming is not supported and fallback is disabled.",
      );
    }
  } else if (capabilities.fetchRequestStreaming) {
    upload = "fetch-stream";
  } else if (capabilities.xhrUpload) {
    upload = "xhr-chunked";
    fallbackReasons.push(
      "auto selected xhr-chunked because fetch upload streaming is unavailable",
    );
  } else {
    throw transportError(
      "transport-unsupported",
      "No supported upload transport is available.",
    );
  }

  return {
    requested,
    actual: {
      download: selected.has("download") ? "fetch-stream" : null,
      upload,
    },
    fallbackReasons,
  };
}

function transportError(code: SpeedTestError["code"], message: string): SpeedTestError {
  return {
    code,
    message,
    recoverable: false,
  };
}
