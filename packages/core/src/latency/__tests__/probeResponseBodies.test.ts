import type { NormalizedLatencyConfig } from "@comet-speedtest/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadWorkerModule, settle } from "../../workers/__tests__/fakeWorkerScope";
import { probeReachability, runIdleLatency } from "../latencyProbe";

const config = {
  enabled: true,
  method: "GET",
  timeoutMs: 1000,
  idleRequests: 2,
  loadedIntervalMs: 750,
} as unknown as NormalizedLatencyConfig;

/** Stub fetch with GET responses whose bodies never end; returns the cancel count. */
function stubStreamingFetch(): { cancelled: number } {
  const counts = { cancelled: 0 };
  vi.stubGlobal("fetch", async () => {
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        counts.cancelled += 1;
      },
    });
    return new Response(body, { status: 200 });
  });
  return counts;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("latency probe response bodies", () => {
  it("cancels each idle probe body after timing it", async () => {
    const counts = stubStreamingFetch();

    await runIdleLatency("/probe", config, () => {}, new AbortController().signal);
    await settle();

    expect(counts.cancelled).toBe(2);
  });

  it("cancels the reachability probe body", async () => {
    const counts = stubStreamingFetch();

    await probeReachability("/probe", config, new AbortController().signal);
    await settle();

    expect(counts.cancelled).toBe(1);
  });

  it("cancels loaded latency probe bodies", async () => {
    const counts = stubStreamingFetch();
    const worker = await loadWorkerModule(() => import("../loadedLatencyWorker"));

    worker.send({
      type: "start-loaded-latency",
      job: {
        workerId: "download-latency",
        target: "/probe",
        phase: "download",
        intervalMs: 10,
        timeoutMs: 1000,
        method: "GET",
      },
    });
    await settle();
    worker.send({ type: "stop" });

    expect(worker.events).toContainEqual(
      expect.objectContaining({ type: "latency", ok: true }),
    );
    expect(counts.cancelled).toBe(1);
  });
});
