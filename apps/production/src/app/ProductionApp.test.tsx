import type { SpeedTestResult } from "@comet-speedtest/core";
import type { SpeedTestWidget } from "@comet-speedtest/internal-ui";
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductionApp } from "./ProductionApp";

type WidgetProps = ComponentProps<typeof SpeedTestWidget>;

const widget = vi.hoisted(() => ({ props: null as WidgetProps | null }));

vi.mock("@comet-speedtest/internal-ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@comet-speedtest/internal-ui")>()),
  SpeedTestWidget: (props: WidgetProps) => {
    widget.props = props;
    return null;
  },
}));

type PendingSubmission = {
  resolve: (response: Response) => void;
  signal: AbortSignal | null | undefined;
};

describe("ProductionApp result submission", () => {
  let host: HTMLDivElement;
  let root: Root;
  let submissions: PendingSubmission[];

  beforeEach(() => {
    submissions = [];
    widget.props = null;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input).endsWith("/comet.config.json")) {
        return Promise.resolve(
          Response.json({
            targets: { download: "/download.bin", upload: "/upload" },
            result: { submitUrl: "/submit" },
          }),
        );
      }
      return new Promise((resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        submissions.push({ resolve, signal: init?.signal });
      });
    });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function renderReadyApp(): Promise<WidgetProps> {
    await act(async () => {
      root.render(<ProductionApp />);
    });
    await vi.waitFor(() => expect(widget.props).not.toBeNull());
    return widget.props!;
  }

  async function reportResult(runId: string): Promise<void> {
    await act(async () => {
      void widget.props?.onResult?.(result(runId));
    });
  }

  it("ignores a submission response from a run that is no longer current", async () => {
    await renderReadyApp();
    await reportResult("run-a");
    await reportResult("run-b");
    expect(submissions).toHaveLength(2);

    await act(async () => {
      submissions[1]?.resolve(new Response(null, { status: 201 }));
    });
    await act(async () => {
      submissions[0]?.resolve(new Response(null, { status: 500 }));
    });

    expect(widget.props?.submission).toEqual({
      runId: "run-b",
      diagnostic: { ok: true, status: 201 },
    });
    expect(host.textContent).not.toContain("HTTP 500");
  });

  it("drops an earlier run's submission failure once the next run starts", async () => {
    await renderReadyApp();
    await reportResult("run-a");
    await act(async () => {
      widget.props?.onStart?.();
    });

    await act(async () => {
      submissions[0]?.resolve(new Response(null, { status: 500 }));
    });

    expect(widget.props?.submission).toBeNull();
    expect(host.textContent).not.toContain("HTTP 500");
  });

  it("reports a submission that times out as a failed submission", async () => {
    const timeout = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);
    await renderReadyApp();
    await reportResult("run-a");
    expect(submissions[0]?.signal).toBe(timeout.signal);

    await act(async () => {
      timeout.abort(new DOMException("signal timed out", "TimeoutError"));
    });

    const message = "Result submission timed out after 15 seconds.";
    expect(widget.props?.submission).toEqual({
      runId: "run-a",
      diagnostic: { ok: false, message },
    });
    expect(host.textContent).toContain(message);
  });
});

function result(runId: string): SpeedTestResult {
  return {
    runId,
    download: null,
    upload: null,
    latency: { idle: null, underDownloadLoad: null, underUploadLoad: null },
  } as unknown as SpeedTestResult;
}
