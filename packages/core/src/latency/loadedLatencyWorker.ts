import { composeAbortSignal } from "../shared/abortSignals";
import type { WorkerCommand } from "../workers/workerProtocol";
import { runMeasurementWorker, type WorkerRuntime } from "../workers/workerRuntime";
import { discardResponseBody } from "./latencyProbe";

async function probe(
  job: Extract<WorkerCommand, { type: "start-loaded-latency" }>["job"],
  runtime: WorkerRuntime,
): Promise<void> {
  const startedAt = performance.now();
  const request = composeAbortSignal({
    signal: runtime.signal,
    timeoutMs: job.timeoutMs,
  });
  try {
    const response = await fetch(job.target, {
      method: job.method,
      cache: "no-store",
      signal: request.signal,
    });
    runtime.post({
      type: "latency",
      workerId: job.workerId,
      phase: job.phase,
      latencyMs: performance.now() - startedAt,
      at: performance.now(),
      ok: response.ok,
    });
    discardResponseBody(response);
  } catch {
    runtime.post({
      type: "latency",
      workerId: job.workerId,
      phase: job.phase,
      latencyMs: performance.now() - startedAt,
      at: performance.now(),
      ok: false,
    });
  } finally {
    request.dispose();
  }
}

runMeasurementWorker("start-loaded-latency", async (job, runtime) => {
  runtime.post({ type: "ready", workerId: job.workerId });
  while (!runtime.stopped) {
    await probe(job, runtime);
    await new Promise((resolve) => setTimeout(resolve, job.intervalMs));
  }
});
