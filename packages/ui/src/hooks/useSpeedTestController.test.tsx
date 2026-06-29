import type { NormalizedSpeedTestConfig } from "@comet-speedtest/config";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSpeedTestController } from "./useSpeedTestController";

const engines: MockEngine[] = [];

vi.mock("@comet-speedtest/core", () => ({
  createSpeedTest: vi.fn((config: NormalizedSpeedTestConfig) => {
    const engine = new MockEngine(config);
    engines.push(engine);
    return engine;
  }),
}));

type EventHandler = (event: {
  sample: {
    phase: "download";
    startedAtMs: number;
    endedAtMs: number;
    durationMs: number;
    bytes: number;
    bitsPerSecond: number;
    warmup: boolean;
    workerBreakdown: Array<{ workerId: string; bytes: number }>;
  };
}) => void;

class MockEngine {
  readonly stop = vi.fn();
  readonly handlers = new Map<string, Set<EventHandler>>();
  private resolveRun: ((outcome: unknown) => void) | null = null;

  constructor(private readonly config: NormalizedSpeedTestConfig) {}

  getConfig(): NormalizedSpeedTestConfig {
    return this.config;
  }

  getState() {
    return {
      status: "idle",
      phase: null,
      runId: null,
      startedAt: null,
      completedAt: null,
      latestSample: null,
      latestLatencySample: null,
      result: null,
      error: null,
    };
  }

  on(event: string, handler: EventHandler): () => void {
    const handlers = this.handlers.get(event) ?? new Set<EventHandler>();
    handlers.add(handler);
    this.handlers.set(event, handlers);
    return () => handlers.delete(handler);
  }

  async run(): Promise<unknown> {
    return new Promise((resolve) => {
      this.resolveRun = resolve;
    });
  }

  emitSample(): void {
    for (const handler of this.handlers.get("sample") ?? []) {
      handler({
        sample: {
          phase: "download",
          startedAtMs: 0,
          endedAtMs: 1,
          durationMs: 1,
          bytes: 1,
          bitsPerSecond: 8,
          warmup: false,
          workerBreakdown: [{ workerId: "worker-1", bytes: 1 }],
        },
      });
    }
  }

  complete(): void {
    this.resolveRun?.({ ok: false, error: { code: "aborted" }, partial: null });
  }
}

describe("useSpeedTestController", () => {
  let host: HTMLDivElement;
  let root: Root;
  let controller: ReturnType<typeof useSpeedTestController>;

  function Harness({ config }: { config: NormalizedSpeedTestConfig }) {
    controller = useSpeedTestController(config);
    return null;
  }

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    engines.length = 0;
  });

  it("stops the engine that owns an active run when config changes", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const initialConfig = config("one");
    const nextConfig = config("two");

    await act(async () => {
      root.render(<Harness config={initialConfig} />);
    });
    let startPromise: Promise<void>;
    await act(async () => {
      startPromise = controller.start();
    });
    await act(async () => {
      root.render(<Harness config={nextConfig} />);
    });

    expect(engines).toHaveLength(2);
    expect(engines[0]?.stop).toHaveBeenCalledWith(
      "Config changed while the run was active.",
    );
    expect(engines[1]?.stop).not.toHaveBeenCalled();

    engines[0]?.emitSample();
    expect(controller.samples).toHaveLength(0);

    engines[0]?.complete();
    await act(async () => {
      await startPromise;
    });
  });
});

function config(hash: string): NormalizedSpeedTestConfig {
  return {
    brand: {
      name: "Comet",
      logoUrl: "",
      faviconUrl: "",
      serverLabel: "",
    },
    theme: {
      colorScheme: "system",
      light: {
        primaryColor: "#000000",
        accentColor: "#000000",
        backgroundColor: "#ffffff",
        surfaceColor: "#ffffff",
        textColor: "#000000",
        mutedTextColor: "#000000",
        borderColor: "#000000",
      },
      dark: {
        primaryColor: "#ffffff",
        accentColor: "#ffffff",
        backgroundColor: "#000000",
        surfaceColor: "#000000",
        textColor: "#ffffff",
        mutedTextColor: "#ffffff",
        borderColor: "#ffffff",
      },
      fontFamily: "system-ui",
      radius: "8px",
    },
    content: {
      title: "Speed",
      subtitle: "",
      startLabel: "Start",
      stopLabel: "Stop",
      restartLabel: "Again",
      downloadLabel: "Download",
      uploadLabel: "Upload",
      latencyLabel: "Latency",
      loadedLatencyLabel: "Loaded latency",
      readyStatus: "Ready",
      runningStatus: "Running",
      completeStatus: "Complete",
      shareLabel: "Share",
    },
    targets: { download: "/download", upload: "/upload", latency: "/latency" },
    targetProfiles: [],
    targetSelection: null,
    test: {
      download: {
        workers: 1,
        transport: "auto",
        maxDurationMs: null,
        firstByteTimeoutMs: 3000,
      },
      upload: {
        workers: 1,
        transport: "auto",
        allowFallback: true,
        fallbackTransport: "xhr-chunked",
        fallbackChunkSizeBytes: 1024,
        streamChunkSizeBytes: 1024,
        maxDurationMs: null,
        firstByteTimeoutMs: 3000,
      },
      sampling: {
        intervalMs: 500,
        samplesPerWindow: 1,
        measuredWindowCount: 1,
        warmupWindowCount: 0,
        percentile: 75,
        includePartialWindowAtLeastRatio: 0.5,
      },
      latency: {
        idleRequests: 0,
        loadedIntervalMs: 500,
        timeoutMs: 2500,
        method: "HEAD",
        enabled: true,
        reachabilityCheck: true,
      },
      selection: {
        phases: ["download"],
        loadedLatency: { download: true, upload: true },
      },
    },
    result: { submitUrl: null, includeRawSamples: false },
    diagnostics: {
      source: "test",
      configHash: hash,
      unknownFields: [],
      normalizedAt: "2026-06-20T00:00:00.000Z",
    },
  };
}
