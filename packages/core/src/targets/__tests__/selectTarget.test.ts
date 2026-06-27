import { afterEach, describe, expect, it, vi } from "vitest";

import { selectTarget, TargetSelectionError } from "../selectTarget";

describe("selectTarget", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("selects the lowest latency candidate", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const times = [0, 40, 40, 55];

    const selected = await selectTarget({
      targets: [
        {
          id: "nyc",
          label: "New York",
          targets: { download: "/nyc/d", upload: "/nyc/u", latency: "/nyc/l" },
        },
        {
          id: "dal",
          label: "Dallas",
          targets: { download: "/dal/d", upload: "/dal/u", latency: "/dal/l" },
        },
      ],
      fetch,
      now: () => times.shift() ?? 55,
    });

    expect(selected.selected.id).toBe("dal");
    expect(selected.targets.download).toBe("/dal/d");
    expect(selected.diagnostics.candidates).toEqual([
      expect.objectContaining({ id: "nyc", latencyMs: 40, ok: true }),
      expect.objectContaining({ id: "dal", latencyMs: 15, ok: true }),
    ]);
  });

  it("forces a target without probing other candidates", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();

    const selected = await selectTarget({
      strategy: "forced",
      targetId: "dal",
      targets: [
        { id: "nyc", targets: { download: "/nyc/d", upload: "/nyc/u" } },
        { id: "dal", targets: { download: "/dal/d", upload: "/dal/u" } },
      ],
      fetch,
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(selected.selected.id).toBe("dal");
  });

  it("throws a typed failure when every candidate fails", async () => {
    await expect(
      selectTarget({
        targets: [
          { id: "nyc", targets: { download: "/nyc/d", upload: "/nyc/u" } },
          { id: "dal", targets: { download: "/dal/d", upload: "/dal/u" } },
        ],
        fetch: vi
          .fn<typeof globalThis.fetch>()
          .mockResolvedValue(new Response(null, { status: 500 })),
        now: () => 0,
      }),
    ).rejects.toBeInstanceOf(TargetSelectionError);
  });

  it("times out probes even when a caller abort signal is present", async () => {
    vi.useFakeTimers();
    const fetch = pendingFetch();
    const caller = new AbortController();

    const selection = selectTarget({
      targets: [{ id: "nyc", targets: { download: "/nyc/d", upload: "/nyc/u" } }],
      fetch,
      now: () => 0,
      signal: caller.signal,
      timeoutMs: 50,
    });
    const expected = expect(selection).rejects.toMatchObject({
      diagnostics: {
        candidates: [
          expect.objectContaining({
            id: "nyc",
            ok: false,
            error: "Target selection timed out.",
          }),
        ],
      },
    });

    await vi.advanceTimersByTimeAsync(50);
    await expected;
  });

  it("lets the caller abort target selection before timeout", async () => {
    vi.useFakeTimers();
    const fetch = pendingFetch();
    const caller = new AbortController();

    const selection = selectTarget({
      targets: [{ id: "nyc", targets: { download: "/nyc/d", upload: "/nyc/u" } }],
      fetch,
      now: () => 0,
      signal: caller.signal,
      timeoutMs: 5_000,
    });
    const expected = expect(selection).rejects.toMatchObject({
      diagnostics: {
        candidates: [
          expect.objectContaining({
            id: "nyc",
            ok: false,
            error: "caller aborted",
          }),
        ],
      },
    });

    caller.abort(new Error("caller aborted"));
    await expected;
  });
});

function pendingFetch(): typeof globalThis.fetch {
  return vi.fn<typeof globalThis.fetch>(
    (_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          return;
        }
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
  );
}
