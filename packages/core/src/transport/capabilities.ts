import type { CapabilityReport } from "../results/resultTypes";

export function detectCapabilities(): CapabilityReport {
  const hasFetch = typeof fetch === "function";
  const hasReadableStream = typeof ReadableStream === "function";
  let fetchRequestStreaming = false;

  if (hasFetch && hasReadableStream && typeof Request === "function") {
    try {
      const request = new Request("https://example.invalid", {
        method: "POST",
        body: new ReadableStream(),
        duplex: "half",
      } as RequestInit & { duplex: "half" });
      fetchRequestStreaming = request.body !== null;
    } catch {
      fetchRequestStreaming = false;
    }
  }

  return {
    fetchResponseStreaming: hasFetch && hasReadableStream,
    fetchRequestStreaming,
    xhrUpload: typeof XMLHttpRequest === "function",
    workers: typeof Worker === "function",
    abortController: typeof AbortController === "function",
  };
}
