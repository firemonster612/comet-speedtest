import type { RuntimeTargets } from "@comet-speedtest/config";

export type TargetSelectionStrategy = "lowest-latency" | "forced";

export interface TargetProfileInput {
  id: string;
  label?: string;
  metadata?: Record<string, unknown>;
  targets?: RuntimeTargets;
  download?: string;
  upload?: string;
  latency?: string;
}

export interface TargetProfile {
  id: string;
  label?: string;
  metadata?: Record<string, unknown>;
  targets: RuntimeTargets;
}

export interface TargetProfileSummary {
  id: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface TargetSelectionCandidateDiagnostic {
  id: string;
  label?: string;
  latencyMs: number | null;
  ok: boolean;
  error?: string;
}

export interface TargetSelectionDiagnostics {
  candidates: TargetSelectionCandidateDiagnostic[];
  selectedReason: string;
}

export interface TargetSelectionResult {
  selected: TargetProfile;
  targets: RuntimeTargets;
  strategy: TargetSelectionStrategy;
  diagnostics: TargetSelectionDiagnostics;
}

export interface TargetSelectionOptions {
  targets: TargetProfileInput[];
  strategy?: TargetSelectionStrategy;
  targetId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetch?: typeof fetch;
  now?: () => number;
}
