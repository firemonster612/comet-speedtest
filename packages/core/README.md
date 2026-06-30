# @comet-speedtest/core

Browser-first speed-test engine for custom clients. The package owns the run
lifecycle: target reachability, idle latency, download throughput, upload
throughput, latency under load, bufferbloat grading, diagnostics, and final
scoring. You bring the config and the UI; the package does the measurement.

This is the npm quick reference. The full guide lives in
[`docs/library/core.md`](../../docs/library/core.md).

## Install

```sh
pnpm add @comet-speedtest/core @comet-speedtest/config
```

`@comet-speedtest/config` is listed because most callers also want the runtime
config types and helpers.

## Mental model

A run has three moving parts:

1. An **engine**, created with `createSpeedTest(config, options?)`. The engine is
   stateful: it holds the normalized config and tracks whether a run is active.
   Create one engine and reuse it, or create one per run. Both patterns work.
2. **Events**, subscribed with `engine.on(...)`. Events stream live progress
   while a run is in flight. Use them to drive a progress UI.
3. An **outcome**, returned by `await engine.run()`. The outcome is the final
   answer for one run. A measurement failure is a value on the outcome, not a
   thrown exception.

Once a run finishes, the `SpeedTestResult` is plain data. Helpers operate on that
result without re-running the test: `createResultRecord` wraps it for storage,
`compareAgainstPlan` checks it against an advertised plan, and
`scoreConnectionQuality` rates it for common activities.

## Basic run

```ts
import { createSpeedTest } from "@comet-speedtest/core";

const engine = createSpeedTest({
  targets: {
    download: "/speedtest/download/large.bin",
    upload: "/speedtest/upload",
    latency: "/speedtest/latency",
  },
});

const outcome = await engine.run();

if (outcome.ok) {
  const downloadMbps = outcome.result.download
    ? outcome.result.download.bitsPerSecond / 1_000_000
    : null;

  console.log(`Download: ${downloadMbps?.toFixed(1) ?? "n/a"} Mbps`);
} else {
  console.error(outcome.error.code, outcome.error.message);
}
```

`createSpeedTest` accepts either a `RuntimeConfig`, the loose JSON shape from
`@comet-speedtest/config`, or a `NormalizedSpeedTestConfig`, the fully defaulted
shape. If you pass relative target URLs and your test endpoints are not
same-origin, pass `baseUrl`:

```ts
const engine = createSpeedTest(config, {
  baseUrl: "https://speed.example.com/",
});
```

## Events

Subscribe with `engine.on(event, handler)` to drive live UI while the run is in
flight:

```ts
const stopSamples = engine.on("sample", (event) => {
  console.log(event.sample.phase, event.sample.bitsPerSecond);
});

const stopLatency = engine.on("latency-sample", (event) => {
  console.log(event.sample.phase, event.sample.latencyMs);
});

engine.on("phase-start", (event) => {
  console.log(event.phase);
});

const outcome = await engine.run();
stopSamples();
stopLatency();
```

Events cover run start, phase changes, throughput samples, throughput windows,
latency samples, phase completion, final result, and run errors. You do not need
events to get the final numbers; the outcome carries those. Events are for
showing work in progress.

## Outcome and nullability

`run()` resolves to one of:

```ts
type RunOutcome =
  | { ok: true; result: SpeedTestResult }
  | { ok: false; error: SpeedTestError; partial: PartialResult | null };
```

Measurement failures are not thrown. Check `outcome.ok`:

```ts
const outcome = await engine.run();

if (!outcome.ok) {
  // partial holds whatever phases finished before the failure, or null.
  renderError(outcome.error.message, outcome.partial);
  return;
}

renderResult(outcome.result);
```

`run()` only throws for caller misuse, such as starting a second run while one is
already active.

Throughput buckets are nullable because phases can be skipped or fail. Latency
buckets are nullable too, and individual latency numbers can be `null` when no
successful probes exist. Always check before reading:

```ts
const downloadMbps = outcome.result.download
  ? outcome.result.download.bitsPerSecond / 1_000_000
  : null;

const idleMedianMs = outcome.result.latency.idle?.medianMs ?? null;
```

`bitsPerSecond` is bits per second. Divide by `1_000_000` for Mbps.

## Result records

`createResultRecord(result, options?)` wraps a completed `SpeedTestResult` in a
portable envelope for storage, submission, analytics, support tickets, or saved
files.

It is intentionally small in scope:

- It does not run a test. You pass it a result you already have.
- It does not submit anything. It returns an object; sending that object is your
  job.
- It structured-clones the result, so the record is independent from the result
  your UI is still rendering.

A record contains:

```ts
interface SpeedTestResultRecord<TContext = Record<string, unknown>> {
  schemaVersion: "comet-result-record/v1";
  createdAt: string;
  result: SpeedTestResult;
  selectedTarget?: { id: string; label?: string; metadata?: Record<string, unknown> };
  context?: TContext;
  privacy: {
    rawSamples: "included" | "stripped" | "not-present";
  };
}
```

Use `selectedTarget` when a run selected among multiple server locations. Use
`context` for caller-owned metadata such as `accountId`, `planId`, `region`,
`appVersion`, or `deploymentId`. Do not put secrets or auth tokens in `context`.

Prefer `rawSamples: "strip"` for stored or submitted records. Raw throughput
samples make payloads larger and expose more detail about one connection at one
moment. Preserve them only when you need per-sample diagnostics.

```ts
import { createResultRecord } from "@comet-speedtest/core";

const record = createResultRecord(result, {
  rawSamples: "strip",
  selectedTarget: { id: "iad", label: "Ashburn" },
  context: {
    accountId: "acct_123",
    planId: "fiber-1000",
    appVersion: "2.4.0",
  },
});

await fetch("/api/speed-results", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(record),
});
```

## Plan comparison

`compareAgainstPlan` answers whether the measured connection is delivering the
advertised plan:

```ts
import { compareAgainstPlan } from "@comet-speedtest/core";

const comparison = compareAgainstPlan(result, {
  downloadMbps: 500,
  uploadMbps: 50,
  acceptableRatio: 0.8,
});

console.log(comparison.status); // "meets-plan" | "below-plan" | "unknown"
```

## Quality scoring

`scoreConnectionQuality` rates a result for everyday activities instead of raw
numbers:

```ts
import { scoreConnectionQuality } from "@comet-speedtest/core";

const quality = scoreConnectionQuality(result);

console.log(quality.overall.grade);
console.log(quality.gaming.limitingFactors);
```

## Entry points

- `@comet-speedtest/core` exports `createSpeedTest`, the result types,
  `createResultRecord`, `compareAgainstPlan`, `scoreConnectionQuality`, and
  `gradeBufferbloat`.
- `@comet-speedtest/core/diagnostics` exports lower-level helpers such as
  `selectTarget`, capability detection, latency aggregation, percentile math, and
  throughput windowing.
- `@comet-speedtest/core/testing` exports deterministic helpers such as
  `createTestSpeedTest` and `SyntheticMeasurementAdapter`.

Most production apps import from the root only. Test adapters belong in test code.
