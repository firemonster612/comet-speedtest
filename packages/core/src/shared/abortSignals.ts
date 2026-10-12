export interface ComposedAbortSignal {
  signal: AbortSignal;
  dispose: () => void;
}

export function composeAbortSignal(options: {
  signal?: AbortSignal;
  timeoutMs?: number;
  timeoutMessage?: string;
}): ComposedAbortSignal {
  const controller = new AbortController();
  const abortFromCaller = (): void => {
    controller.abort(options.signal?.reason);
  };
  const abortFromTimeout = (): void => {
    controller.abort(
      new DOMException(options.timeoutMessage ?? "Request timed out.", "TimeoutError"),
    );
  };
  const timeout =
    options.timeoutMs === undefined
      ? null
      : setTimeout(abortFromTimeout, options.timeoutMs);

  if (options.signal?.aborted) {
    abortFromCaller();
  } else {
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  return {
    signal: controller.signal,
    dispose: () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      options.signal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

/**
 * Wait `durationMs`, rejecting with the signal's reason as soon as it aborts.
 * The abort listener is removed when the timer fires, so repeated waits on a
 * long-lived signal leave nothing behind.
 */
export function abortableDelay(durationMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, durationMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
