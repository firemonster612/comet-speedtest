import type { WorkerEvent } from "../workers/workerProtocol";
import { runMeasurementWorker } from "../workers/workerRuntime";

function makeBlob(size: number): Blob {
  return new Blob([new Uint8Array(size)], { type: "application/octet-stream" });
}

function sendChunk(
  target: string,
  blob: Blob,
  workerId: string,
  post: (event: WorkerEvent) => void,
  register: (xhr: XMLHttpRequest) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    register(xhr);
    let lastLoaded = 0;
    xhr.open("POST", target, true);
    xhr.upload.onprogress = (event) => {
      const delta = Math.max(0, event.loaded - lastLoaded);
      lastLoaded = event.loaded;
      if (delta > 0) {
        post({
          type: "bytes",
          workerId,
          phase: "upload",
          bytes: delta,
          at: performance.now(),
        });
      }
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`XHR upload failed with HTTP ${xhr.status}`));
        return;
      }
      if (lastLoaded < blob.size) {
        const delta = blob.size - lastLoaded;
        post({
          type: "bytes",
          workerId,
          phase: "upload",
          bytes: delta,
          at: performance.now(),
        });
      }
      resolve(blob.size);
    };
    xhr.onerror = () => reject(new Error("XHR upload failed"));
    xhr.onabort = () => resolve(lastLoaded);
    xhr.send(blob);
  });
}

runMeasurementWorker("start-upload", async (job, runtime) => {
  runtime.post({ type: "ready", workerId: job.workerId });
  const blob = makeBlob(job.chunkSizeBytes);
  let activeXhr: XMLHttpRequest | null = null;
  runtime.onStop(() => activeXhr?.abort());
  while (!runtime.stopped) {
    await sendChunk(job.target, blob, job.workerId, runtime.post, (xhr) => {
      activeXhr = xhr;
    });
  }
});
