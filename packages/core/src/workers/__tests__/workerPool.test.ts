import { describe, expect, it, vi } from "vitest";

import { WorkerPool } from "../workerPool";
import type { WorkerEvent } from "../workerProtocol";

describe("WorkerPool", () => {
  it("drops messages a worker had queued when the pool stops", () => {
    const onEvent = vi.fn();
    const pool = new WorkerPool(onEvent);
    const worker = {
      onmessage: null,
      onerror: null,
      postMessage: () => {},
      terminate: () => {},
    } as unknown as Worker;
    pool.start("upload-0", worker, {
      type: "start-upload",
      job: { workerId: "upload-0", target: "/u", runId: "run-1", chunkSizeBytes: 1 },
    });

    pool.stop("phase complete");
    // The browser delivers an already-queued message to the current handler.
    worker.onmessage?.({
      data: { type: "ready", workerId: "upload-0" } satisfies WorkerEvent,
    } as MessageEvent<WorkerEvent>);

    expect(onEvent).not.toHaveBeenCalled();
  });
});
