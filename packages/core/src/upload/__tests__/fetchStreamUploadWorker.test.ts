import { afterEach, describe, expect, it, vi } from "vitest";

import { loadWorkerModule, settle } from "../../workers/__tests__/fakeWorkerScope";

const chunkSizeBytes = 1024;

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A fetch that reads `chunksRead` chunks of the request body, then hangs. */
function stubFetchReading(chunksRead: number): void {
  vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit) => {
    const reader = (init.body as ReadableStream<Uint8Array>).getReader();
    for (let index = 0; index < chunksRead; index += 1) {
      await reader.read();
    }
    return new Promise<Response>(() => {});
  });
}

async function uploadedBytesAfter(chunksRead: number): Promise<number> {
  stubFetchReading(chunksRead);
  const worker = await loadWorkerModule(() => import("../fetchStreamUploadWorker"));
  worker.send({
    type: "start-upload",
    job: {
      workerId: "upload-0",
      target: "https://x.test/u",
      runId: "r",
      chunkSizeBytes,
    },
  });
  await settle();
  worker.send({ type: "stop" });
  return worker.events.reduce(
    (sum, event) => sum + (event.type === "bytes" ? event.bytes : 0),
    0,
  );
}

describe("fetch-stream upload worker", () => {
  it("counts nothing while fetch has not taken a chunk", async () => {
    expect(await uploadedBytesAfter(0)).toBe(0);
  });

  it("counts only the chunks fetch has taken, not the one still queued", async () => {
    expect(await uploadedBytesAfter(3)).toBe(3 * chunkSizeBytes);
  });
});
