import type { WorkerCommand } from "../workers/workerProtocol";
import { runMeasurementWorker, type WorkerRuntime } from "../workers/workerRuntime";

async function probe(
  job: Extract<WorkerCommand, { type: "start-loaded-latency" }>["job"],
  runtime: WorkerRuntime,
): Promise<void> {
  const startedAt = performance.now();
  const controller = new AbortController();
  runtime.signal.addEventListener("abort", () => controller.abort(), { once: true });
  const timeout = setTimeout(() => controller.abort(), job.timeoutMs);
  try {
    const response = await fetch(job.target, {
      method: job.method,
      cache: "no-store",
      signal: controller.signal,
    });
    runtime.post({
      type: "latency",
      workerId: job.workerId,
      phase: job.phase,
      latencyMs: performance.now() - startedAt,
      at: performance.now(),
      ok: response.ok,
    });
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
    clearTimeout(timeout);
  }
}

runMeasurementWorker("start-loaded-latency", async (job, runtime) => {
  runtime.post({ type: "ready", workerId: job.workerId });
  while (!runtime.stopped) {
    await probe(job, runtime);
    await new Promise((resolve) => setTimeout(resolve, job.intervalMs));
  }
});
