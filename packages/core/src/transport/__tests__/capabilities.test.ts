import { afterEach, describe, expect, it, vi } from "vitest";

import { detectCapabilities } from "../capabilities";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectCapabilities request streaming", () => {
  it("reports support when Request reads duplex and sets no Content-Type", () => {
    // Node's Request implements streaming request bodies the way Chromium does.
    expect(detectCapabilities().fetchRequestStreaming).toBe(true);
  });

  it("rejects a Request that ignores duplex and stringifies the stream body", () => {
    // Firefox: no `Request.body`, `duplex` never read, and the stream becomes
    // the text "[object ReadableStream]" with a text/plain Content-Type.
    class StringifyingRequest {
      readonly headers = new Headers({ "Content-Type": "text/plain;charset=UTF-8" });
    }
    vi.stubGlobal("Request", StringifyingRequest);

    expect(detectCapabilities().fetchRequestStreaming).toBe(false);
  });
});
