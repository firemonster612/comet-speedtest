import { defaultRuntimeConfig } from "./defaults";

/**
 * Single source of truth for the tunable `test` section fields.
 *
 * Each field's range, editor label, and parent section live here once. Validation
 * (validateRuntimeConfig), normalization (normalize), and the playground editor
 * panels all derive from this table instead of re-declaring the same ranges and
 * key lists. Default *values* remain in `defaults.ts` and are read back through
 * {@link testFieldDefault}, so there is exactly one literal source for each.
 */
export type TestSection = "download" | "upload" | "sampling" | "latency";

export type RuntimeFieldKind = "string" | "nullableString" | "boolean" | "object";

export type RuntimeObjectSection = "brand" | "content" | "result";

export interface RuntimeFieldSpec {
  section: RuntimeObjectSection;
  key: string;
  label: string;
  kind: RuntimeFieldKind;
}

export type TestFieldKind =
  | "integer"
  | "number"
  | "nullableInteger"
  | "boolean"
  | "enum";

export interface TestFieldSpec {
  section: TestSection;
  key: string;
  label: string;
  kind: TestFieldKind;
  min?: number;
  max?: number;
  allowed?: readonly string[];
  step?: number;
}

const MAX_DURATION_MS = 30 * 60 * 1000;

export const runtimeFieldSchema: readonly RuntimeFieldSpec[] = [
  { section: "brand", key: "name", label: "Brand name", kind: "string" },
  { section: "brand", key: "logoUrl", label: "Logo URL", kind: "string" },
  { section: "brand", key: "faviconUrl", label: "Favicon URL", kind: "string" },
  {
    section: "brand",
    key: "serverLabel",
    label: "Server label",
    kind: "string",
  },
  { section: "content", key: "title", label: "Title", kind: "string" },
  { section: "content", key: "subtitle", label: "Subtitle", kind: "string" },
  { section: "content", key: "startLabel", label: "Start label", kind: "string" },
  { section: "content", key: "stopLabel", label: "Stop label", kind: "string" },
  {
    section: "content",
    key: "restartLabel",
    label: "Restart label",
    kind: "string",
  },
  {
    section: "content",
    key: "downloadLabel",
    label: "Download label",
    kind: "string",
  },
  { section: "content", key: "uploadLabel", label: "Upload label", kind: "string" },
  {
    section: "content",
    key: "latencyLabel",
    label: "Latency label",
    kind: "string",
  },
  {
    section: "content",
    key: "loadedLatencyLabel",
    label: "Loaded latency label",
    kind: "string",
  },
  {
    section: "content",
    key: "readyStatus",
    label: "Ready status",
    kind: "string",
  },
  {
    section: "content",
    key: "runningStatus",
    label: "Running status",
    kind: "string",
  },
  {
    section: "content",
    key: "completeStatus",
    label: "Complete status",
    kind: "string",
  },
  { section: "content", key: "shareLabel", label: "Share label", kind: "string" },
  {
    section: "result",
    key: "submitUrl",
    label: "Submit URL",
    kind: "nullableString",
  },
  {
    section: "result",
    key: "includeRawSamples",
    label: "Include raw samples",
    kind: "boolean",
  },
];

export const testFieldSchema: readonly TestFieldSpec[] = [
  // Download throughput
  {
    section: "download",
    key: "workers",
    label: "Download workers",
    kind: "integer",
    min: 1,
    max: 32,
  },
  {
    section: "download",
    key: "transport",
    label: "Download transport",
    kind: "enum",
    allowed: ["auto", "fetch-stream"],
  },
  {
    section: "download",
    key: "maxDurationMs",
    label: "Download max duration ms",
    kind: "nullableInteger",
    min: 0,
    max: MAX_DURATION_MS,
  },
  {
    section: "download",
    key: "firstByteTimeoutMs",
    label: "Download first-byte timeout ms",
    kind: "integer",
    min: 0,
    max: 60_000,
  },

  // Upload throughput
  {
    section: "upload",
    key: "workers",
    label: "Upload workers",
    kind: "integer",
    min: 1,
    max: 32,
  },
  {
    section: "upload",
    key: "transport",
    label: "Upload transport",
    kind: "enum",
    allowed: ["auto", "fetch-stream", "xhr-chunked"],
  },
  {
    section: "upload",
    key: "allowFallback",
    label: "Allow upload fallback",
    kind: "boolean",
  },
  {
    section: "upload",
    key: "fallbackTransport",
    label: "Fallback transport",
    kind: "enum",
    allowed: ["xhr-chunked"],
  },
  {
    section: "upload",
    key: "fallbackChunkSizeBytes",
    label: "Fallback chunk bytes",
    kind: "integer",
    min: 1024,
    max: 256 * 1024 * 1024,
  },
  {
    section: "upload",
    key: "streamChunkSizeBytes",
    label: "Fetch stream chunk bytes",
    kind: "integer",
    min: 1024,
    max: 16 * 1024 * 1024,
  },
  {
    section: "upload",
    key: "maxDurationMs",
    label: "Upload max duration ms",
    kind: "nullableInteger",
    min: 0,
    max: MAX_DURATION_MS,
  },
  {
    section: "upload",
    key: "firstByteTimeoutMs",
    label: "Upload first-byte timeout ms",
    kind: "integer",
    min: 0,
    max: 60_000,
  },

  // Sampling
  {
    section: "sampling",
    key: "intervalMs",
    label: "Sample interval ms",
    kind: "integer",
    min: 100,
    max: 10_000,
  },
  {
    section: "sampling",
    key: "samplesPerWindow",
    label: "Samples per window",
    kind: "integer",
    min: 1,
    max: 120,
  },
  {
    section: "sampling",
    key: "measuredWindowCount",
    label: "Measured windows",
    kind: "integer",
    min: 1,
    max: 60,
  },
  {
    section: "sampling",
    key: "warmupWindowCount",
    label: "Warmup windows",
    kind: "integer",
    min: 0,
    max: 20,
  },
  {
    section: "sampling",
    key: "percentile",
    label: "Percentile",
    kind: "number",
    min: 0,
    max: 100,
  },
  {
    section: "sampling",
    key: "includePartialWindowAtLeastRatio",
    label: "Partial window ratio",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.1,
  },

  // Latency
  { section: "latency", key: "enabled", label: "Enabled", kind: "boolean" },
  {
    section: "latency",
    key: "reachabilityCheck",
    label: "Reachability check",
    kind: "boolean",
  },
  {
    section: "latency",
    key: "idleRequests",
    label: "Idle request count",
    kind: "integer",
    min: 0,
    max: 100,
  },
  {
    section: "latency",
    key: "loadedIntervalMs",
    label: "Loaded interval ms",
    kind: "integer",
    min: 100,
    max: 60_000,
  },
  {
    section: "latency",
    key: "timeoutMs",
    label: "Timeout ms",
    kind: "integer",
    min: 100,
    max: 60_000,
  },
  {
    section: "latency",
    key: "method",
    label: "Method",
    kind: "enum",
    allowed: ["HEAD", "GET"],
  },
];

export function runtimeSectionFields(
  section: RuntimeObjectSection,
): RuntimeFieldSpec[] {
  return runtimeFieldSchema.filter((field) => field.section === section);
}

export function runtimeSectionKeys(section: RuntimeObjectSection): string[] {
  return runtimeSectionFields(section).map((field) => field.key);
}

export function testSectionFields(section: TestSection): TestFieldSpec[] {
  return testFieldSchema.filter((field) => field.section === section);
}

export function testSectionKeys(section: TestSection): string[] {
  return testSectionFields(section).map((field) => field.key);
}

/** The default value for a field, read from the single literal in `defaults.ts`. */
export function testFieldDefault(
  spec: TestFieldSpec,
): number | string | boolean | null {
  const section = defaultRuntimeConfig.test?.[spec.section] as
    | Record<string, number | string | boolean | null>
    | undefined;
  return section?.[spec.key] ?? null;
}
