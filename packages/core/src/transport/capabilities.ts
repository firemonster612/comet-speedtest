import type { CapabilityReport } from "../results/resultTypes";

/**
 * Browsers without request streaming never read `duplex` and serialize the
 * stream as the text "[object ReadableStream]", which sets a text/plain
 * Content-Type. Only a browser that read `duplex` and left Content-Type unset
 * will actually stream the body.
 */
function supportsRequestStreaming(): boolean {
  let duplexRead = false;
  try {
    const hasContentType = new Request("https://example.invalid", {
      method: "POST",
      body: new ReadableStream(),
      get duplex() {
        duplexRead = true;
        return "half";
      },
    } as RequestInit).headers.has("Content-Type");
    return duplexRead && !hasContentType;
  } catch {
    return false;
  }
}

export function detectCapabilities(): CapabilityReport {
  const hasFetch = typeof fetch === "function";
  const hasReadableStream = typeof ReadableStream === "function";

  return {
    fetchResponseStreaming: hasFetch && hasReadableStream,
    fetchRequestStreaming:
      hasFetch &&
      hasReadableStream &&
      typeof Request === "function" &&
      supportsRequestStreaming(),
    xhrUpload: typeof XMLHttpRequest === "function",
    workers: typeof Worker === "function",
    abortController: typeof AbortController === "function",
  };
}
