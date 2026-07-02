import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResultReadout } from "./ResultReadout";

describe("ResultReadout", () => {
  it("renders accessible info controls for each result measurement", () => {
    const markup = renderToString(
      <ResultReadout
        downloadBufferbloat={{ addedLatencyMs: 21.4, grade: "A" }}
        idleJitterMs={2.3}
        labels={{
          download: "Download",
          upload: "Upload",
          idleLatency: "Latency",
          downloadLatency: "Download latency",
          uploadLatency: "Upload latency",
        }}
        loadedJitterMs={9.8}
        uploadBufferbloat={{ addedLatencyMs: 44.8, grade: "B" }}
        values={{
          downloadBps: 120_000_000,
          uploadBps: 42_000_000,
          idleLatencyMs: 12,
          downloadLatencyMs: 38,
          uploadLatencyMs: 57,
        }}
      />,
    );

    expect(markup).toContain('aria-label="About Download"');
    expect(markup).toContain('aria-label="About Upload"');
    expect(markup).toContain('aria-label="About Latency"');
    expect(markup).toContain('aria-label="About Jitter"');
    expect(markup).toContain('aria-label="About Download latency"');
    expect(markup).toContain('aria-label="About Upload latency"');
    expect(markup).toContain('aria-label="About Bufferbloat grade"');
    expect(markup).not.toContain("title=");
  });
});
