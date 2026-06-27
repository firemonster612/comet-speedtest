export interface ComposedAbortSignal {
  signal: AbortSignal;
  dispose: () => void;
}

export function composeAbortSignal(options: {
  signal?: AbortSignal;
  timeoutMs?: number;
}): ComposedAbortSignal {
  const controller = new AbortController();
  const abortFromCaller = (): void => {
    controller.abort(options.signal?.reason);
  };
  const abortFromTimeout = (): void => {
    controller.abort(new DOMException("Target selection timed out.", "TimeoutError"));
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
