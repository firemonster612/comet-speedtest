import type { NormalizedSpeedTestConfig } from "@comet-speedtest/config";
import { act, Activity, StrictMode, useEffect } from "react";
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

type EventHandler = (event: unknown) => void;

class MockEngine {
  readonly stop = vi.fn();
  readonly handlers = new Map<string, Set<EventHandler>>();
  runCount = 0;
  private status: "idle" | "running" | "complete" | "error" = "idle";
  private resolveRun: ((outcome: unknown) => void) | null = null;

  constructor(private readonly config: NormalizedSpeedTestConfig) {}

  getConfig(): NormalizedSpeedTestConfig {
    return this.config;
  }

  getState() {
    return {
      status: this.status,
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

  // Like the real engine, a second run is rejected until the first settles.
  async run(): Promise<unknown> {
    if (this.status === "running") {
      throw { code: "aborted", message: "A speed test run is already active." };
    }
    this.runCount += 1;
    this.status = "running";
    this.emit("start", { type: "start" });
    return new Promise((resolve) => {
      this.resolveRun = resolve;
    });
  }

  emit(type: string, event: unknown): void {
    for (const handler of this.handlers.get(type) ?? []) {
      handler(event);
    }
  }

  emitSample(phase: "download" | "upload" = "download"): void {
    this.emit("sample", {
      type: "sample",
      sample: {
        phase,
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

  complete(): void {
    const error = { code: "aborted" };
    this.settle("error", { ok: false, error, partial: null });
    this.emit("error", { type: "error", error });
  }

  succeed(runId: string): void {
    const result = { runId };
    this.settle("complete", { ok: true, result });
    this.emit("result", { type: "result", result });
  }

  // Like the real engine, the state settles before the terminal event fires.
  private settle(status: "complete" | "error", outcome: unknown): void {
    this.status = status;
    this.resolveRun?.(outcome);
    this.resolveRun = null;
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

  function mount(): void {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }

  // Wrapped so awaiting `startRun` doesn't also await the run itself.
  async function startRun(): Promise<{ run: Promise<void> }> {
    let run!: Promise<void>;
    await act(async () => {
      run = controller.start();
    });
    return { run };
  }

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    engines.length = 0;
  });

  it("stops the engine that owns an active run when config changes", async () => {
    mount();
    await act(async () => {
      root.render(<Harness config={config("one")} />);
    });
    const { run } = await startRun();
    await act(async () => {
      root.render(<Harness config={config("two")} />);
    });

    expect(engines).toHaveLength(2);
    expect(engines[0]?.stop).toHaveBeenCalledOnce();
    expect(engines[1]?.stop).not.toHaveBeenCalled();

    engines[0]?.emitSample();
    expect(controller.samples).toHaveLength(0);

    engines[0]?.complete();
    await act(async () => {
      await run;
    });
  });

  it("ignores result and error events from a run superseded by a config change", async () => {
    mount();
    await act(async () => {
      root.render(<Harness config={config("one")} />);
    });
    await startRun();
    await act(async () => {
      root.render(<Harness config={config("two")} />);
    });

    await act(async () => {
      engines[0]?.emit("error", { type: "error", error: { code: "aborted" } });
      engines[0]?.emit("result", { type: "result", result: { runId: "old" } });
    });

    expect(controller.error).toBeNull();
    expect(controller.result).toBeNull();
  });

  it("stops the active run on unmount, including under StrictMode", async () => {
    mount();
    await act(async () => {
      root.render(
        <StrictMode>
          <Harness config={config("one")} />
        </StrictMode>,
      );
    });
    await startRun();
    expect(engines[0]?.stop).not.toHaveBeenCalled();

    act(() => root.unmount());

    expect(engines[0]?.stop).toHaveBeenCalledOnce();
    // afterEach unmounts again; give it a fresh root.
    root = createRoot(host);
  });

  it("leaves running once a run disposed by an effect re-run settles", async () => {
    mount();
    const render = (mode: "visible" | "hidden") =>
      act(async () => {
        root.render(
          <Activity mode={mode}>
            <Harness config={config("one")} />
          </Activity>,
        );
      });
    await render("visible");
    await startRun();
    // Hiding disposes the run; showing again re-runs the effect on the same engine.
    await render("hidden");
    await render("visible");
    const engine = engines[0]!;
    expect(engines).toHaveLength(1);
    expect(engine.stop).toHaveBeenCalledOnce();

    await act(async () => engine.complete());
    expect(controller.state.status).toBe("error");

    await startRun();
    expect(engine.runCount).toBe(2);
    expect(controller.state.status).toBe("running");
  });

  it("keeps a finished run on screen when the effect re-runs on the same engine", async () => {
    mount();
    const render = (mode: "visible" | "hidden") =>
      act(async () => {
        root.render(
          <Activity mode={mode}>
            <Harness config={config("one")} />
          </Activity>,
        );
      });
    await render("visible");
    await startRun();
    await act(async () => engines[0]!.succeed("r1"));
    expect(controller.result?.runId).toBe("r1");

    await render("hidden");
    await render("visible");

    expect(controller.state.status).toBe("complete");
    expect(controller.result?.runId).toBe("r1");
  });

  function AutoStartHarness({ config }: { config: NormalizedSpeedTestConfig }) {
    controller = useSpeedTestController(config);
    const { start } = controller;
    useEffect(() => {
      void start();
    }, [start]);
    return null;
  }

  async function mountAutoStart(): Promise<MockEngine> {
    mount();
    await act(async () => {
      root.render(
        <StrictMode>
          <AutoStartHarness config={config("one")} />
        </StrictMode>,
      );
    });
    return engines.at(-1)!;
  }

  it("starts from a mount effect under StrictMode once the stopped run settles", async () => {
    const engine = await mountAutoStart();
    // StrictMode's simulated unmount stopped the first run, which hasn't settled.
    expect(engine.stop).toHaveBeenCalledOnce();
    expect(engine.runCount).toBe(1);

    await act(async () => engine.complete());
    expect(engine.runCount).toBe(2);
    expect(controller.state.status).toBe("running");

    await act(async () => engine.succeed("second"));
    expect(controller.result).toEqual({ runId: "second" });
    expect(controller.state.status).toBe("complete");
  });

  it("stops a run that was waiting for the engine as soon as it starts", async () => {
    const engine = await mountAutoStart();
    act(() => controller.stop());

    await act(async () => engine.complete());

    expect(engine.runCount).toBe(2);
    // Disposal, the user's stop while waiting, then the started run.
    expect(engine.stop).toHaveBeenCalledTimes(3);
  });

  it("drops the samples of a phase the engine resets", async () => {
    mount();
    await act(async () => {
      root.render(<Harness config={config("one")} />);
    });
    await startRun();

    await act(async () => {
      engines[0]?.emitSample("download");
      engines[0]?.emitSample("upload");
      engines[0]?.emitSample("upload");
    });
    expect(controller.samples).toHaveLength(3);

    await act(async () => {
      engines[0]?.emit("phase-reset", {
        type: "phase-reset",
        phase: "upload",
        reason: "Falling back to xhr-chunked.",
      });
    });

    expect(controller.samples.map((sample) => sample.phase)).toEqual(["download"]);
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
