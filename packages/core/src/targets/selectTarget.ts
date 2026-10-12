import { composeAbortSignal } from "../shared/abortSignals";
import type {
  TargetProfile,
  TargetProfileInput,
  TargetSelectionCandidateDiagnostic,
  TargetSelectionDiagnostics,
  TargetSelectionOptions,
  TargetSelectionResult,
} from "./targetTypes";

export class TargetSelectionError extends Error {
  readonly code = "target-selection-failed";
  readonly diagnostics: TargetSelectionDiagnostics;

  constructor(message: string, diagnostics: TargetSelectionDiagnostics) {
    super(message);
    this.name = "TargetSelectionError";
    this.diagnostics = diagnostics;
  }
}

function normalizeTargetProfile(profile: TargetProfileInput): TargetProfile {
  const targets = profile.targets ?? {
    download: profile.download ?? "",
    upload: profile.upload ?? "",
    ...(profile.latency ? { latency: profile.latency } : {}),
  };
  return {
    id: profile.id,
    ...(profile.label ? { label: profile.label } : {}),
    ...(profile.metadata ? { metadata: profile.metadata } : {}),
    targets,
  };
}

function validateProfile(profile: TargetProfile): void {
  if (!profile.id.trim()) {
    throw new Error("Target profile id is required.");
  }
  if (!profile.targets.download.trim() || !profile.targets.upload.trim()) {
    throw new Error(
      `Target profile "${profile.id}" requires download and upload URLs.`,
    );
  }
}

async function measureLatency(
  profile: TargetProfile,
  options: Required<Pick<TargetSelectionOptions, "fetch" | "now">> &
    Pick<TargetSelectionOptions, "signal" | "timeoutMs">,
): Promise<TargetSelectionCandidateDiagnostic> {
  const url = profile.targets.latency ?? profile.targets.download;
  const abort = composeAbortSignal({
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    timeoutMessage: "Target selection timed out.",
  });
  const startedAt = options.now();
  try {
    const response = await options.fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: abort.signal,
    });
    const latencyMs = options.now() - startedAt;
    return {
      id: profile.id,
      ...(profile.label ? { label: profile.label } : {}),
      latencyMs,
      ok: response.ok,
      ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
    };
  } catch (error) {
    return {
      id: profile.id,
      ...(profile.label ? { label: profile.label } : {}),
      latencyMs: null,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    abort.dispose();
  }
}

export async function selectTarget(
  options: TargetSelectionOptions,
): Promise<TargetSelectionResult> {
  const strategy = options.strategy ?? "lowest-latency";
  const profiles = options.targets.map(normalizeTargetProfile);
  for (const profile of profiles) {
    validateProfile(profile);
  }

  if (strategy === "forced") {
    const selected = profiles.find((profile) => profile.id === options.targetId);
    if (!selected) {
      throw new TargetSelectionError(
        `Forced target "${options.targetId}" was not found.`,
        {
          candidates: profiles.map((profile) => ({
            id: profile.id,
            ...(profile.label ? { label: profile.label } : {}),
            latencyMs: null,
            ok: false,
            error: "not selected",
          })),
          selectedReason: "forced target id did not match any candidate",
        },
      );
    }
    return {
      selected,
      targets: selected.targets,
      strategy,
      diagnostics: {
        candidates: [
          {
            id: selected.id,
            ...(selected.label ? { label: selected.label } : {}),
            latencyMs: null,
            ok: true,
          },
        ],
        selectedReason: `forced target "${selected.id}" selected`,
      },
    };
  }

  const fetcher = options.fetch ?? globalThis.fetch;
  if (typeof fetcher !== "function") {
    throw new TargetSelectionError("Target selection requires fetch.", {
      candidates: [],
      selectedReason: "fetch is unavailable",
    });
  }

  const diagnostics = await Promise.all(
    profiles.map((profile) =>
      measureLatency(profile, {
        fetch: fetcher,
        now: options.now ?? performance.now.bind(performance),
        ...(options.signal ? { signal: options.signal } : {}),
        timeoutMs: options.timeoutMs ?? 2_500,
      }),
    ),
  );
  const ranked = diagnostics
    .filter(
      (
        candidate,
      ): candidate is TargetSelectionCandidateDiagnostic & { latencyMs: number } =>
        candidate.ok && candidate.latencyMs !== null,
    )
    .sort((a, b) => a.latencyMs - b.latencyMs || a.id.localeCompare(b.id));
  const fastest = ranked[0];
  if (!fastest) {
    throw new TargetSelectionError("All target latency checks failed.", {
      candidates: diagnostics,
      selectedReason: "all latency checks failed",
    });
  }
  const selected = profiles.find((profile) => profile.id === fastest.id);
  if (!selected) {
    throw new TargetSelectionError("Selected target was not found.", {
      candidates: diagnostics,
      selectedReason: "selected diagnostic had no matching target",
    });
  }
  return {
    selected,
    targets: selected.targets,
    strategy,
    diagnostics: {
      candidates: diagnostics,
      selectedReason: `lowest latency target "${selected.id}" selected`,
    },
  };
}
