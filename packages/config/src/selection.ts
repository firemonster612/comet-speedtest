import type {
  NormalizedTestSelectionConfig,
  RuntimeTestSelectionConfig,
  SpeedTestRunPhase,
  ThroughputRunPhase,
} from "./runtimeConfig";

const RUN_PHASES: readonly SpeedTestRunPhase[] = ["idle-latency", "download", "upload"];
const THROUGHPUT_PHASES: readonly ThroughputRunPhase[] = ["download", "upload"];

export const speedTestRunPhases = RUN_PHASES;
export const throughputRunPhases = THROUGHPUT_PHASES;

export function normalizeTestSelection(
  selection: RuntimeTestSelectionConfig | undefined,
  fallback: NormalizedTestSelectionConfig,
): NormalizedTestSelectionConfig {
  const phases = selection?.phases
    ? normalizePhaseList(selection.phases)
    : [...fallback.phases];
  const loadedLatency =
    selection?.loadedLatency === undefined
      ? { ...fallback.loadedLatency }
      : normalizeLoadedLatency(selection.loadedLatency, fallback.loadedLatency);

  if (phases.length === 0) {
    throw new Error("test.selection.phases must include at least one phase.");
  }

  return {
    phases,
    loadedLatency,
  };
}

export function isSpeedTestRunPhase(value: unknown): value is SpeedTestRunPhase {
  return typeof value === "string" && RUN_PHASES.includes(value as SpeedTestRunPhase);
}

export function isThroughputRunPhase(value: unknown): value is ThroughputRunPhase {
  return (
    typeof value === "string" && THROUGHPUT_PHASES.includes(value as ThroughputRunPhase)
  );
}

function normalizePhaseList(phases: readonly SpeedTestRunPhase[]): SpeedTestRunPhase[] {
  if (!Array.isArray(phases)) {
    throw new Error("test.selection.phases must be an array.");
  }
  if (phases.length === 0) {
    throw new Error("test.selection.phases must include at least one phase.");
  }
  const seen = new Set<string>();
  for (const phase of phases) {
    if (!isSpeedTestRunPhase(phase)) {
      throw new Error(
        "test.selection.phases may only include idle-latency, download, or upload.",
      );
    }
    if (seen.has(phase)) {
      throw new Error(`test.selection.phases contains duplicate phase "${phase}".`);
    }
    seen.add(phase);
  }
  const selected = new Set(phases);
  return RUN_PHASES.filter((phase) => selected.has(phase));
}

function normalizeLoadedLatency(
  value: NonNullable<RuntimeTestSelectionConfig["loadedLatency"]>,
  fallback: Record<ThroughputRunPhase, boolean>,
): Record<ThroughputRunPhase, boolean> {
  if (typeof value === "boolean") {
    return {
      download: value,
      upload: value,
    };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      "test.selection.loadedLatency must be a boolean or a download/upload object.",
    );
  }
  for (const phase of THROUGHPUT_PHASES) {
    if (value[phase] !== undefined && typeof value[phase] !== "boolean") {
      throw new Error(`test.selection.loadedLatency.${phase} must be a boolean.`);
    }
  }
  return {
    download: value.download ?? fallback.download,
    upload: value.upload ?? fallback.upload,
  };
}
