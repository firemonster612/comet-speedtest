import { runMeasurementWorker } from "../workers/workerRuntime";

function cacheBusted(target: string, runId: string, workerId: string): string {
  const url = new URL(target);
  url.searchParams.set("lightspeedRun", runId);
  url.searchParams.set("worker", workerId);
  url.searchParams.set("t", String(Date.now()));
  return url.toString();
}

runMeasurementWorker("start-download", async (job, runtime) => {
  runtime.post({ type: "ready", workerId: job.workerId });
  while (!runtime.stopped) {
    const response = await fetch(cacheBusted(job.target, job.runId, job.workerId), {
      cache: "no-store",
      signal: runtime.signal,
    });
    if (!response.ok) {
      throw new Error(`Download failed with HTTP ${response.status}`);
    }
    // Guard against SPA / catch-all servers that answer 200 with an HTML page
    // (e.g. a dev server's index.html fallback) — measuring that is meaningless.
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      throw new Error(
        "Download endpoint returned an HTML page instead of test data; check the download URL.",
      );
    }
    if (!response.body) {
      const body = await response.arrayBuffer();
      runtime.post({
        type: "bytes",
        workerId: job.workerId,
        phase: "download",
        bytes: body.byteLength,
        at: performance.now(),
      });
      continue;
    }
    const reader = response.body.getReader();
    while (!runtime.stopped) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      runtime.post({
        type: "bytes",
        workerId: job.workerId,
        phase: "download",
        bytes: chunk.value.byteLength,
        at: performance.now(),
      });
    }
    reader.releaseLock();
  }
});
