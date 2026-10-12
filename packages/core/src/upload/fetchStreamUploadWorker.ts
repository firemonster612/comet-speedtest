import { runMeasurementWorker } from "../workers/workerRuntime";

function makeChunk(size: number): Uint8Array {
  const chunk = new Uint8Array(size);
  for (let index = 0; index < chunk.length; index += 4096) {
    chunk[index] = index % 251;
  }
  return chunk;
}

runMeasurementWorker("start-upload", async (job, runtime) => {
  runtime.post({ type: "ready", workerId: job.workerId });
  const chunk = makeChunk(job.chunkSizeBytes);
  // The stream pulls once on construction and again only after fetch takes the
  // queued chunk, so a pull is proof that the previous chunk left the queue.
  // Counting on enqueue would report a chunk fetch never read.
  let hasEnqueued = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (runtime.stopped) {
          controller.close();
          return;
        }
        if (hasEnqueued) {
          runtime.post({
            type: "bytes",
            workerId: job.workerId,
            phase: "upload",
            bytes: chunk.byteLength,
            at: performance.now(),
          });
        }
        controller.enqueue(chunk);
        hasEnqueued = true;
      },
    },
    {
      highWaterMark: 1,
      size(queuedChunk) {
        return queuedChunk.byteLength;
      },
    },
  );
  const response = await fetch(job.target, {
    method: "POST",
    body,
    cache: "no-store",
    signal: runtime.signal,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  if (!response.ok) {
    throw new Error(`Upload failed with HTTP ${response.status}`);
  }
});
