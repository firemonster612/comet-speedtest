import type { WorkerCommand, WorkerEvent } from "./workerProtocol";

export interface ManagedWorker {
  id: string;
  worker: Worker;
}

export class WorkerPool {
  private readonly workers: ManagedWorker[] = [];

  constructor(private readonly onEvent: (event: WorkerEvent) => void) {}

  start(id: string, worker: Worker, command: WorkerCommand): void {
    worker.onmessage = (message: MessageEvent<WorkerEvent>) => {
      this.onEvent(message.data);
    };
    worker.onerror = (event) => {
      this.onEvent({
        type: "error",
        workerId: id,
        error: { message: event.message },
      });
    };
    this.workers.push({ id, worker });
    worker.postMessage(command);
  }

  stop(reason: string): void {
    for (const managed of this.workers) {
      // Messages already queued from this worker are dropped, not delivered to a
      // phase that has finished.
      managed.worker.onmessage = null;
      managed.worker.onerror = null;
      managed.worker.postMessage({ type: "stop", reason } satisfies WorkerCommand);
      setTimeout(() => managed.worker.terminate(), 0);
    }
    this.workers.splice(0, this.workers.length);
  }

  size(): number {
    return this.workers.length;
  }
}
