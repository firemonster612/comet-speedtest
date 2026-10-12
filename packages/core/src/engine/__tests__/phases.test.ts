import { normalizeConfig } from "@comet-speedtest/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkerCommand, WorkerEvent } from "../../workers/workerProtocol";
import { runWorkerPhase } from "../phases";

/** Stub `Worker` so every started throughput worker runs `script`. */
function stubWorkers(script: (emit: (event: WorkerEvent) => void) => void): void {
  vi.stubGlobal(
    "Worker",
    class {
      onmessage: ((message: MessageEvent<WorkerEvent>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;

      postMessage(command: WorkerCommand): void {
        if (command.type === "stop") {
          return;
        }
        queueMicrotask(() => {
          script((event) =>
            this.onmessage?.({ data: event } as MessageEvent<WorkerEvent>),
          );
        });
      }

      terminate(): void {}
    },
  );
}

const transferring = (emit: (event: WorkerEvent) => void): void => {
  emit({ type: "ready", workerId: "download-0" });
  emit({ type: "bytes", workerId: "download-0", phase: "download", bytes: 1e6, at: 0 });
};

function runDownload(options: {
  maxDurationMs: number | null;
  warmupWindowCount: number;
  signal?: AbortSignal;
}) {
  const config = normalizeConfig({
    targets: { download: "https://x.test/d", upload: "https://x.test/u" },
    test: {
      download: { workers: 1, maxDurationMs: options.maxDurationMs },
      sampling: {
        intervalMs: 100,
        samplesPerWindow: 1,
        warmupWindowCount: options.warmupWindowCount,
        measuredWindowCount: 1,
      },
    },
  });
  return runWorkerPhase({
    phase: "download",
    config,
    runId: "run-1",
    uploadTransport: "fetch-stream",
    loadedLatency: false,
    signal: options.signal ?? new AbortController().signal,
    emit: { sample: () => {}, window: () => {}, latency: () => {} },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runWorkerPhase", () => {
  it("fails when maxDurationMs ends the phase before a measured window", async () => {
    stubWorkers(transferring);

    await expect(
      runDownload({ maxDurationMs: 1, warmupWindowCount: 1 }),
    ).rejects.toThrow("ended before a measured window completed");
  });

  it("fails when every worker failed, even if maxDurationMs ended the phase", async () => {
    stubWorkers((emit) => {
      transferring(emit);
      emit({
        type: "error",
        workerId: "download-0",
        error: { message: "Download failed with HTTP 500" },
      });
    });

    await expect(
      runDownload({ maxDurationMs: 1, warmupWindowCount: 0 }),
    ).rejects.toThrow("HTTP 500");
  });

  it("leaves no abort listeners on the run signal after the phase", async () => {
    stubWorkers(transferring);
    const signal = new AbortController().signal;
    const listeners = new Set<unknown>();
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    signal.addEventListener = (type: string, listener: unknown, options?: unknown) => {
      listeners.add(listener);
      add(type, listener as EventListener, options as AddEventListenerOptions);
    };
    signal.removeEventListener = (type: string, listener: unknown) => {
      listeners.delete(listener);
      remove(type, listener as EventListener);
    };

    const result = await runDownload({
      maxDurationMs: null,
      warmupWindowCount: 0,
      signal,
    });

    expect(result.throughput.bitsPerSecond).toBeGreaterThan(0);
    expect(listeners.size).toBe(0);
  });
});
