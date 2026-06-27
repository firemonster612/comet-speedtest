export type TransportPreference = "auto" | "fetch-stream" | "xhr-chunked";
export type DownloadTransportPreference = "auto" | "fetch-stream";
export type UploadTransportPreference = TransportPreference;
export type LatencyMethod = "HEAD" | "GET";
export type ColorScheme = "light" | "dark" | "system";
export type SpeedTestRunPhase = "idle-latency" | "download" | "upload";
export type ThroughputRunPhase = "download" | "upload";

export interface RuntimeBrand {
  name?: string;
  logoUrl?: string;
  faviconUrl?: string;
  serverLabel?: string;
}

export interface RuntimeThemePalette {
  primaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textColor?: string;
  mutedTextColor?: string;
  borderColor?: string;
}

export interface RuntimeTheme {
  colorScheme?: ColorScheme;
  light?: RuntimeThemePalette;
  dark?: RuntimeThemePalette;
  /** @deprecated Use `theme.light.primaryColor` instead. */
  primaryColor?: string;
  /** @deprecated Use `theme.light.accentColor` instead. */
  accentColor?: string;
  /** @deprecated Use `theme.light.backgroundColor` instead. */
  backgroundColor?: string;
  /** @deprecated Use `theme.light.surfaceColor` instead. */
  surfaceColor?: string;
  /** @deprecated Use `theme.light.textColor` instead. */
  textColor?: string;
  /** @deprecated Use `theme.light.mutedTextColor` instead. */
  mutedTextColor?: string;
  /** @deprecated Use `theme.light.borderColor` instead. */
  borderColor?: string;
  fontFamily?: string;
  radius?: string;
}

export interface RuntimeContent {
  title?: string;
  subtitle?: string;
  startLabel?: string;
  stopLabel?: string;
  restartLabel?: string;
  downloadLabel?: string;
  uploadLabel?: string;
  latencyLabel?: string;
  loadedLatencyLabel?: string;
  readyStatus?: string;
  runningStatus?: string;
  completeStatus?: string;
  shareLabel?: string;
}

export interface RuntimeTargets {
  download: string;
  upload: string;
  latency?: string;
}

export interface RuntimeTargetProfile {
  id: string;
  label?: string;
  metadata?: Record<string, unknown>;
  targets: RuntimeTargets;
}

export type RuntimeTargetSelectionStrategy = "lowest-latency" | "forced";

export interface RuntimeTargetSelectionConfig {
  strategy?: RuntimeTargetSelectionStrategy;
  targetId?: string;
}

export interface RuntimeDownloadThroughputConfig {
  workers?: number;
  transport?: DownloadTransportPreference;
  maxDurationMs?: number | null;
  /** Fail the phase if no bytes arrive this many ms after it starts (0 disables). */
  firstByteTimeoutMs?: number;
}

export interface RuntimeUploadThroughputConfig {
  workers?: number;
  transport?: UploadTransportPreference;
  allowFallback?: boolean;
  fallbackTransport?: "xhr-chunked";
  fallbackChunkSizeBytes?: number;
  streamChunkSizeBytes?: number;
  maxDurationMs?: number | null;
  /** Fail the phase if no bytes arrive this many ms after it starts (0 disables). */
  firstByteTimeoutMs?: number;
}

export interface RuntimeSamplingConfig {
  intervalMs?: number;
  samplesPerWindow?: number;
  measuredWindowCount?: number;
  warmupWindowCount?: number;
  percentile?: number;
  includePartialWindowAtLeastRatio?: number;
}

export interface RuntimeLatencyConfig {
  idleRequests?: number;
  loadedIntervalMs?: number;
  timeoutMs?: number;
  method?: LatencyMethod;
  enabled?: boolean;
  /**
   * Run a single pre-flight connectivity probe (using `method`/`timeoutMs`) to
   * each target before the run; fail fast if a target can't be reached at all.
   * Independent of `enabled`, which only governs the latency measurement phase.
   */
  reachabilityCheck?: boolean;
}

export interface RuntimeTestSelectionConfig {
  phases?: SpeedTestRunPhase[];
  loadedLatency?: boolean | Partial<Record<ThroughputRunPhase, boolean>>;
}

export interface RuntimeTestConfig {
  download?: RuntimeDownloadThroughputConfig;
  upload?: RuntimeUploadThroughputConfig;
  sampling?: RuntimeSamplingConfig;
  latency?: RuntimeLatencyConfig;
  selection?: RuntimeTestSelectionConfig;
}

export interface RuntimeResultConfig {
  submitUrl?: string | null;
  includeRawSamples?: boolean;
}

export interface RuntimeConfig {
  $schema?: string;
  brand?: RuntimeBrand;
  theme?: RuntimeTheme;
  content?: RuntimeContent;
  targets: RuntimeTargets;
  targetProfiles?: RuntimeTargetProfile[];
  targetSelection?: RuntimeTargetSelectionConfig | null;
  test?: RuntimeTestConfig;
  result?: RuntimeResultConfig;
}

export interface NormalizedTargetProfile {
  id: string;
  label?: string;
  metadata?: Record<string, unknown>;
  targets: Required<RuntimeTargets>;
}

export interface NormalizedTargetSelectionConfig {
  strategy: RuntimeTargetSelectionStrategy;
  targetId?: string;
}

export interface NormalizedDownloadThroughputConfig {
  workers: number;
  transport: DownloadTransportPreference;
  maxDurationMs: number | null;
  firstByteTimeoutMs: number;
}

export interface NormalizedUploadThroughputConfig {
  workers: number;
  transport: UploadTransportPreference;
  allowFallback: boolean;
  fallbackTransport: "xhr-chunked";
  fallbackChunkSizeBytes: number;
  streamChunkSizeBytes: number;
  maxDurationMs: number | null;
  firstByteTimeoutMs: number;
}

export interface NormalizedSamplingConfig {
  intervalMs: number;
  samplesPerWindow: number;
  measuredWindowCount: number;
  warmupWindowCount: number;
  percentile: number;
  includePartialWindowAtLeastRatio: number;
}

export interface NormalizedLatencyConfig {
  idleRequests: number;
  loadedIntervalMs: number;
  timeoutMs: number;
  method: LatencyMethod;
  enabled: boolean;
  reachabilityCheck: boolean;
}

export interface NormalizedTestSelectionConfig {
  phases: SpeedTestRunPhase[];
  loadedLatency: Record<ThroughputRunPhase, boolean>;
}

export interface NormalizedRuntimeTheme {
  colorScheme: ColorScheme;
  light: Required<RuntimeThemePalette>;
  dark: Required<RuntimeThemePalette>;
  fontFamily: string;
  radius: string;
}

export interface NormalizedSpeedTestConfig {
  brand: Required<RuntimeBrand>;
  theme: NormalizedRuntimeTheme;
  content: Required<RuntimeContent>;
  targets: Required<RuntimeTargets>;
  targetProfiles: NormalizedTargetProfile[];
  targetSelection: NormalizedTargetSelectionConfig | null;
  test: {
    download: NormalizedDownloadThroughputConfig;
    upload: NormalizedUploadThroughputConfig;
    sampling: NormalizedSamplingConfig;
    latency: NormalizedLatencyConfig;
    selection: NormalizedTestSelectionConfig;
  };
  result: Required<RuntimeResultConfig>;
  diagnostics: {
    source: string;
    configHash: string;
    unknownFields: string[];
    normalizedAt: string;
  };
}

export interface ValidationIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  unknownFields: string[];
}
