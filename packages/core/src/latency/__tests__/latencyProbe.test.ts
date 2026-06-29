import type { NormalizedLatencyConfig } from "@comet-speedtest/config";
import { afterEach, describe, expect, it } from "vitest";

import { probeReachability } from "../latencyProbe";

const config = {
  enabled: true,
  method: "GET",
  timeoutMs: 50,
  idleRequests: 1,
  loadedIntervalMs: 750,
} as unknown as NormalizedLatencyConfig;

const previousFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = previousFetch;
});

describe("probeReachability", () => {
  it("reports reachable when the server answers, even with a non-2xx status", async () => {
    globalThis.fetch = (async () =>
      new Response(null, { status: 503 })) as typeof fetch;

    const result = await probeReachability(
      "/probe",
      config,
      new AbortController().signal,
    );

    expect(result).toEqual({ reachable: true, status: 503 });
  });

  it("reports unreachable on a network error", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    const result = await probeReachability(
      "/probe",
      config,
      new AbortController().signal,
    );

    expect(result.reachable).toBe(false);
    expect(result.reason).toContain("Failed to fetch");
  });

  it("reports unreachable when the connection hangs past the timeout", async () => {
    // A connection that never settles but honors the abort signal — the hung /
    // firewalled case. The probe's own timeout aborts it.
    globalThis.fetch = ((_input, init: RequestInit | undefined) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      })) as typeof fetch;

    const result = await probeReachability(
      "/probe",
      config,
      new AbortController().signal,
    );

    expect(result.reachable).toBe(false);
    expect(result.reason).toContain("no response within 50 ms");
  });

  it("rethrows as a run abort when the run signal is already aborted", async () => {
    globalThis.fetch = ((_input, init: RequestInit | undefined) =>
      new Promise((_resolve, reject) => {
        const abort = () => reject(new DOMException("Aborted", "AbortError"));
        if (init?.signal?.aborted) {
          abort();
          return;
        }
        init?.signal?.addEventListener("abort", abort, { once: true });
      })) as typeof fetch;

    const controller = new AbortController();
    controller.abort();

    await expect(
      probeReachability("/probe", config, controller.signal),
    ).rejects.toThrow("Run aborted");
  });
});
