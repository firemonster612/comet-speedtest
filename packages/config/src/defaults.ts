import type { NormalizedSpeedTestConfig, RuntimeConfig } from "./runtimeConfig";

export const defaultRuntimeConfig: RuntimeConfig = {
  brand: {
    name: "Comet",
    logoUrl: "",
    faviconUrl: "",
    serverLabel: "",
  },
  theme: {
    colorScheme: "system",
    light: {
      primaryColor: "#6dbbdf",
      accentColor: "#c95f3d",
      backgroundColor: "#fbfcfd",
      surfaceColor: "#ffffff",
      textColor: "#17202a",
      mutedTextColor: "#5d6978",
      borderColor: "#d7dee7",
    },
    dark: {
      primaryColor: "#6dbbdf",
      accentColor: "#ff9a78",
      backgroundColor: "#0f1419",
      surfaceColor: "#171f27",
      textColor: "#edf4f8",
      mutedTextColor: "#a8b5c2",
      borderColor: "#344454",
    },
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    radius: "8px",
  },
  content: {
    title: "Internet Speed Test",
    subtitle: "Measure download, upload, idle latency, and latency under load.",
    startLabel: "Go",
    stopLabel: "Stop",
    restartLabel: "Run again",
    downloadLabel: "Download",
    uploadLabel: "Upload",
    latencyLabel: "Latency",
    loadedLatencyLabel: "Latency under load",
    readyStatus: "Ready when you are.",
    runningStatus: "Measuring your connection…",
    completeStatus: "Test complete.",
    shareLabel: "Copy result",
  },
  targets: {
    download: "/speedtest/download/large.bin",
    upload: "/speedtest/upload",
    latency: "/speedtest/latency",
  },
  targetProfiles: [],
  targetSelection: null,
  test: {
    download: {
      workers: 4,
      transport: "auto",
      maxDurationMs: null,
      firstByteTimeoutMs: 3000,
    },
    upload: {
      workers: 4,
      transport: "auto",
      allowFallback: true,
      fallbackTransport: "xhr-chunked",
      fallbackChunkSizeBytes: 16 * 1024 * 1024,
      streamChunkSizeBytes: 256 * 1024,
      maxDurationMs: null,
      firstByteTimeoutMs: 3000,
    },
    sampling: {
      intervalMs: 500,
      samplesPerWindow: 6,
      measuredWindowCount: 5,
      warmupWindowCount: 1,
      percentile: 75,
      includePartialWindowAtLeastRatio: 0.5,
    },
    latency: {
      idleRequests: 8,
      loadedIntervalMs: 750,
      timeoutMs: 2500,
      method: "HEAD",
      enabled: true,
      reachabilityCheck: true,
    },
    selection: {
      phases: ["idle-latency", "download", "upload"],
      loadedLatency: {
        download: true,
        upload: true,
      },
    },
  },
  result: {
    submitUrl: null,
    includeRawSamples: false,
  },
};

export type DefaultedRuntimeConfig = Omit<NormalizedSpeedTestConfig, "diagnostics">;
