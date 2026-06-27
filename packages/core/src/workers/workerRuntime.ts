import type { WorkerCommand, WorkerEvent } from "./workerProtocol";

type StartCommand = Exclude<WorkerCommand, { type: "stop" }>;
type StartType = StartCommand["type"];
type JobFor<T extends StartType> = Extract<StartCommand, { type: T }>["job"];

/**
 * What a measurement worker's loop is handed. The harness owns the command
 * dispatch, the ready/error/stop plumbing, and the stop-driven {@link signal};
 * the loop only has to measure and {@link post} byte/latency events.
 */
export interface WorkerRuntime {
  post: (event: WorkerEvent) => void;
  /** True once a `stop` command has arrived; loops poll this to exit. */
  readonly stopped: boolean;
  /** Aborts when `stop` arrives — pass to fetch/request signals. */
  readonly signal: AbortSignal;
  /** Register a callback to run on stop (e.g. to abort an in-flight XHR). */
  onStop: (handler: () => void) => void;
}

/**
 * Wire a measurement worker to the {@link WorkerCommand}/{@link WorkerEvent}
 * protocol.
 *
 * This is the single home for the scaffolding every worker used to copy: posting
 * the protocol's `stop` semantics, exposing an abort signal that fires on stop,
 * and converting a thrown loop into a protocol `error` event. A graceful stop is
 * not reported as an error.
 */
export function runMeasurementWorker<T extends StartType>(
  type: T,
  handler: (job: JobFor<T>, runtime: WorkerRuntime) => Promise<void>,
): void {
  const controller = new AbortController();
  const stopHandlers: Array<() => void> = [];
  let stopped = false;

  const runtime: WorkerRuntime = {
    post: (event) => {
      self.postMessage(event);
    },
    get stopped() {
      return stopped;
    },
    signal: controller.signal,
    onStop: (handler) => {
      stopHandlers.push(handler);
    },
  };

  self.onmessage = (message: MessageEvent<WorkerCommand>) => {
    const command = message.data;
    if (command.type === "stop") {
      stopped = true;
      controller.abort();
      for (const stopHandler of stopHandlers) {
        stopHandler();
      }
      return;
    }
    if (command.type !== type) {
      return;
    }
    const job = (command as { job: unknown }).job as JobFor<T>;
    handler(job, runtime).catch((error: unknown) => {
      if (stopped) {
        return;
      }
      runtime.post({
        type: "error",
        workerId: job.workerId,
        error: { message: error instanceof Error ? error.message : String(error) },
      });
    });
  };
}
