import { vi } from "vitest";

import type { WorkerCommand, WorkerEvent } from "../workerProtocol";

export interface FakeWorkerScope {
  /** Every event the worker posted, in order. */
  readonly events: WorkerEvent[];
  send: (command: WorkerCommand) => void;
}

/**
 * Evaluate a worker module against a fake `self`, so its real message loop can be
 * driven from a test. Callers restore globals with `vi.unstubAllGlobals()`.
 */
export async function loadWorkerModule(
  load: () => Promise<unknown>,
): Promise<FakeWorkerScope> {
  const events: WorkerEvent[] = [];
  const scope = {
    onmessage: null as ((message: MessageEvent<WorkerCommand>) => void) | null,
    postMessage: (event: WorkerEvent) => {
      events.push(event);
    },
  };
  vi.stubGlobal("self", scope);
  vi.resetModules();
  await load();
  return {
    events,
    send: (command) => {
      scope.onmessage?.({ data: command } as MessageEvent<WorkerCommand>);
    },
  };
}

/** Let pending stream pulls, fetch continuations and zero-delay timers run. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
