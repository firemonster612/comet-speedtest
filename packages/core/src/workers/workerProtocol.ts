import type { LatencyMethod } from "@lightspeed/config";

import type { ThroughputPhase } from "../results/resultTypes";

export interface DownloadWorkerJob {
  workerId: string;
  target: string;
  runId: string;
}

export interface UploadWorkerJob {
  workerId: string;
  target: string;
  runId: string;
  chunkSizeBytes: number;
}

export interface LoadedLatencyWorkerJob {
  workerId: string;
  target: string;
  phase: Exclude<ThroughputPhase, never>;
  intervalMs: number;
  timeoutMs: number;
  method: LatencyMethod;
}

export type WorkerCommand =
  | { type: "start-download"; job: DownloadWorkerJob }
  | { type: "start-upload"; job: UploadWorkerJob }
  | { type: "start-loaded-latency"; job: LoadedLatencyWorkerJob }
  | { type: "stop"; reason?: string };

export type WorkerEvent =
  | { type: "ready"; workerId: string }
  | {
      type: "bytes";
      workerId: string;
      phase: ThroughputPhase;
      bytes: number;
      at: number;
    }
  | {
      type: "latency";
      workerId: string;
      phase: ThroughputPhase;
      latencyMs: number;
      at: number;
      ok: boolean;
    }
  | { type: "error"; workerId: string; error: { message: string; name?: string } };
