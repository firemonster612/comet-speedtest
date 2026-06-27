import type { SpeedTestError, SpeedTestState } from "../results/resultTypes";

export function initialState(): SpeedTestState {
  return {
    status: "idle",
    phase: null,
    runId: null,
    startedAt: null,
    completedAt: null,
    latestSample: null,
    latestLatencySample: null,
    result: null,
    error: null,
  };
}

export function toSpeedTestError(
  error: unknown,
  fallback: SpeedTestError,
): SpeedTestError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "recoverable" in error
  ) {
    return error as SpeedTestError;
  }
  if (error instanceof Error) {
    return {
      ...fallback,
      message: error.message,
      cause: error,
    };
  }
  return {
    ...fallback,
    message: String(error),
  };
}

export function makeRunId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
