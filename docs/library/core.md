# @comet-speedtest/core

`@comet-speedtest/core` runs a browser speed test and returns a typed result. It
owns the run lifecycle so you do not have to: target reachability, idle latency,
download throughput, upload throughput, latency under load, bufferbloat grading,
diagnostics, and final scoring. You bring the configuration and the UI; the
package does the measurement.

This is the full guide. If you only want a quick reference, the npm README at
`packages/core/README.md` is a shorter version of the same material.

## Mental model

A run has three moving parts:

1. An **engine**, created with `createSpeedTest(config, options?)`. The engine is
   stateful: it holds the normalized config and tracks whether a run is active.
   Create one engine and reuse it across runs, or create one per run; both work.
2. **Events**, subscribed with `engine.on(...)`. Events stream live progress
   while a run is in flight: throughput samples, latency samples, phase
   transitions. Use them to drive a progress UI.
3. An **outcome**, returned by `await engine.run()`. The outcome is the final
   answer for one run. A measurement failure is a value on the outcome, not a
   thrown exception.

Once a run finishes, the `SpeedTestResult` it produces is a plain data object.
Everything else in the package operates on that result without re-running
anything: `createResultRecord` wraps it for storage, `compareAgainstPlan` checks
it against an advertised plan, and `scoreConnectionQuality` rates it for common
activities.

## Install

```sh
pnpm add @comet-speedtest/core @comet-speedtest/config
```

`@comet-speedtest/config` is listed alongside core because most callers also want
the runtime config types and helpers. See `docs/library/config.md` for that
package.

## Entry points

The package has three import paths, separated so production code does not
accidentally depend on test-only or low-level internals.

- `@comet-speedtest/core` - the root. This is what production callers use:
  `createSpeedTest`, the result types, `createResultRecord`, `compareAgainstPlan`,
  `scoreConnectionQuality`, and `gradeBufferbloat`.
- `@comet-speedtest/core/diagnostics` - lower-level building blocks:
  `selectTarget`, capability detection, transport resolution, latency
  aggregation, percentile math, and throughput windowing. Reach for this only
  when you need a piece of the pipeline on its own.
- `@comet-speedtest/core/testing` - deterministic adapters for your own tests:
  `createTestSpeedTest` and `SyntheticMeasurementAdapter`. The root entry point
  does not accept a measurement adapter, which keeps test-only behavior off the
  production surface.

Most apps import from the root only.

## A minimal run

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
  const mbps = outcome.result.download
    ? outcome.result.download.bitsPerSecond / 1_000_000
    : null;
  console.log(`Download: ${mbps?.toFixed(1) ?? "n/a"} Mbps`);
} else {
  console.error(outcome.error.code, outcome.error.message);
}
```

`createSpeedTest` accepts either a `RuntimeConfig` (the loosely-typed JSON shape
from `@comet-speedtest/config`) or a `NormalizedSpeedTestConfig` (the fully
defaulted, frozen shape). If you pass a `RuntimeConfig`, the engine normalizes it
for you. The only required target fields are `targets.download` and
`targets.upload`; `targets.latency` defaults to the download target.

### baseUrl and relative URLs

Target URLs in the config may be relative (`"/speedtest/download/large.bin"`).
The engine resolves them against a base URL:

```ts
const engine = createSpeedTest(config, {
  baseUrl: "https://speed.example.com/",
});
```

If you do not pass `baseUrl`, the default is `location.href` in a browser and
`http://localhost/` outside a browser (for example in a test runner or on a
server). Relative URLs only make sense if the base resolves to where your
endpoints actually live, so set `baseUrl` explicitly when the page origin and the
test endpoints differ.

## Listening for events

`engine.on(event, handler)` registers a handler and returns an unsubscribe
function. Handlers are called synchronously as the run progresses.

```ts
const unsubscribe = engine.on("sample", (event) => {
  // event.sample.phase is "download" | "upload"
  console.log(event.sample.phase, event.sample.bitsPerSecond);
});

engine.on("latency-sample", (event) => {
  // event.sample.phase is "idle" | "download" | "upload"
  console.log(event.sample.latencyMs, event.sample.ok);
});

const outcome = await engine.run();
unsubscribe();
```

The events and their payloads:

- `start` - `{ runId, config }`. A run began. `config` is the normalized config
  the run will use.
- `phase-start` - `{ phase }`. `phase` is `"idle-latency"`, `"download"`,
  `"upload"`, or `"finalize"`.
- `sample` - `{ sample }`. A throughput sample. `sample.bitsPerSecond` is the
  instantaneous rate; `sample.warmup` is `true` for samples taken before
  measurement officially starts.
- `phase-reset` - `{ phase, reason }`. A throughput phase is starting over, so
  discard every `sample`, `window`, and `latency-sample` you already received for
  `phase`. Today this happens when fetch-stream upload fails at runtime and the
  engine retries the upload on `xhr-chunked` (see "Runtime upload fallback"
  below). `reason` matches the entry added to `diagnostics.fallbackReasons`.
  `getState()` already reflects the reset when the event fires, and no event from
  the failed attempt arrives after it.
- `window` - `{ window }`. A completed throughput window (an aggregate of several
  samples). `window.averageBitsPerSecond` is the window's total bytes over its
  total duration, so a sample that ran long because a timer fired late counts
  for more than a short one.
- `latency-sample` - `{ sample }`. One latency probe, idle or under load.
  `sample.ok` is `false` for a probe that timed out or failed.
- `phase-complete` - `{ phase, result }`. One phase finished. `result` is a
  `ThroughputResult` for download/upload phases, or a `LatencyResult` for latency
  phases.
- `result` - `{ result }`. The run completed successfully. `result` is the full
  `SpeedTestResult`. This fires only on success.
- `error` - `{ error }`. The run failed or was stopped. `error` is a
  `SpeedTestError`.

For a progress UI, `sample`/`window` drive a live throughput readout,
`latency-sample` drives a latency readout, and `phase-start`/`phase-complete`
drive a step indicator. You do not need events to get the final numbers; the
outcome carries everything. Events are for showing work in progress.

`engine.getState()` returns a snapshot (`status`, current `phase`, latest sample,
latest result, latest error) if you prefer to poll instead of subscribe.

## Handling the outcome

`engine.run(options?)` resolves to a `RunOutcome`:

```ts
type RunOutcome =
  | { ok: true; result: SpeedTestResult }
  | { ok: false; error: SpeedTestError; partial: PartialResult | null };
```

A normal measurement failure (an unreachable target, a download that never
streams bytes, an aborted run) is reported as `{ ok: false, ... }`, not thrown.
This is deliberate: a failed speed test is an expected result, not a bug in your
code, so you handle it with a branch rather than a `try/catch`.

```ts
const outcome = await engine.run();

if (!outcome.ok) {
  // error.code is a known string: "target-unreachable", "download-failed",
  // "upload-failed", "latency-failed", "aborted", "timeout", "internal-error",
  // and others.
  console.error(outcome.error.code, outcome.error.message);

  // partial holds whatever phases finished before the failure, or null.
  if (outcome.partial?.completedPhases.download) {
    console.log("Download finished before the failure.");
  }
  return;
}

const result = outcome.result;
```

`run()` only **throws** for caller misuse - specifically, starting a second run
while one is still active. If you call `run()` from a UI, guard against
double-clicks rather than relying on a `try/catch`.

To stop an active run:

```ts
engine.stop("User stopped the run.");
```

`stop` ends the current run; the in-flight `run()` promise resolves to an
`{ ok: false }` outcome with an `aborted` error and whatever partial result was
collected. This holds even when you call `stop` from an event listener after the
last measured phase (for example in `phase-complete` for upload): the run ends as
aborted, never as a success, and its finished phases are in the partial result.
A listener for `result` or `error` may start the next run; `stop` then applies to
that new run. Listeners registered after that one still receive the earlier
run's `result` or `error`, after the new run's `start` event has fired, so key
results by `runId` rather than assuming the last `start` owns them.

Listener exceptions never affect a run. Like DOM `EventTarget` dispatch, a
listener that throws is reported as an uncaught error (through `reportError`
where the platform has it), the remaining listeners still receive the event,
and the run's measurements and outcome are unchanged. This holds for every
event. To end a run from a listener, call `stop`.

`internal-error` means an untyped failure outside any measured phase, before the
first phase starts or while finalizing the result. A failure inside a phase gets
that phase's code (`latency-failed`, `download-failed`, `upload-failed`).

## Selecting phases per run

A run measures phases in this order: idle latency, download, upload, with latency
sampled under download and upload load. The default selection comes from the
config (`test.selection`; see `docs/library/config.md`). You can override it for a
single run without touching the config:

```ts
import type { SpeedTestRunOptions } from "@comet-speedtest/core";

const options: SpeedTestRunOptions = {
  selection: {
    phases: ["idle-latency", "download"],
    loadedLatency: { download: true, upload: false },
  },
};

const outcome = await engine.run(options);
```

`phases` is any subset of `"idle-latency"`, `"download"`, `"upload"`.
`loadedLatency` can be a single boolean (applies to both directions) or an object
with per-direction flags. A "download only" run is useful when you want a fast
readout and do not care about upload or jitter.

Skipping a phase means its result bucket is `null`. Always check before reading
(see "Reading the result" below).

## Reading the result

`SpeedTestResult` is the central data type. Its shape:

```ts
interface SpeedTestResult {
  runId: string;
  startedAt: string; // ISO timestamp
  completedAt: string; // ISO timestamp
  configHash: string; // identifies the config used, for grouping results
  download: ThroughputResult | null;
  upload: ThroughputResult | null;
  latency: {
    idle: LatencyResult | null;
    underDownloadLoad: LatencyResult | null;
    underUploadLoad: LatencyResult | null;
  };
  bufferbloat: BufferbloatResult;
  diagnostics: SpeedTestDiagnostics;
}
```

### Throughput buckets are nullable

`download` and `upload` are `ThroughputResult | null`. They are `null` when the
phase did not run (you deselected it) or failed before producing a final result.
Never read `.bitsPerSecond` without checking first:

```ts
function toMbps(t: ThroughputResult | null): number | null {
  return t ? t.bitsPerSecond / 1_000_000 : null;
}

const downloadMbps = toMbps(result.download);
const uploadMbps = toMbps(result.upload);
```

`bitsPerSecond` is bits per second. Divide by `1_000_000` for Mbps (decimal
megabits, the usual unit for advertised speeds), or by `1_048_576` if you want
mebibits. Do not confuse this with `bytesTransferred`, which is the total bytes
moved during the phase, not a rate.

A `ThroughputResult` carries:

- `bitsPerSecond` - the headline rate, computed at the configured `percentile`.
- `bytesTransferred` - total bytes moved during the measured part of the phase.
- `durationMs` - measured duration.
- `percentile` - which percentile `bitsPerSecond` represents (the config default
  is 75).
- `sampleIntervalMs`, `samplesPerWindow`, `measuredWindowCount`,
  `warmupWindowCount` - the sampling parameters the run used.
- `samples?` and `windows?` - the raw per-sample and per-window data. These are
  optional. They are present when raw samples are kept and absent (or stripped)
  otherwise.

### Latency buckets are nullable, and so are their fields

```ts
interface LatencyResult {
  meanMs: number | null;
  medianMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  p95Ms: number | null;
  jitterMs: number | null;
  samples: LatencySample[];
}
```

A whole bucket (`latency.idle`, `latency.underDownloadLoad`,
`latency.underUploadLoad`) is `null` when that latency phase did not run. The
numeric fields inside are individually `null` when no successful sample exists -
for example, if every probe timed out, `samples` may be non-empty but `medianMs`
is `null`. Treat each number as possibly missing:

```ts
const idleMedian = result.latency.idle?.medianMs ?? null;
```

`jitterMs` is the mean of the absolute differences between consecutive successful
samples (it is `null` with fewer than two successful samples).

### Bufferbloat

`bufferbloat` compares latency under load to idle latency. Bufferbloat is the
extra delay that shows up when a link is saturated; high bufferbloat hurts video
calls and gaming even when raw throughput looks fine.

```ts
interface BufferbloatResult {
  idleLatencyMs: number | null;
  loadedLatencyMs: number | null;
  addedLatencyMs: number | null;
  grade: "A" | "B" | "C" | "D" | "F" | null;
  download: BufferbloatDirection | null; // { loadedLatencyMs, addedLatencyMs, grade }
  upload: BufferbloatDirection | null;
}
```

The top-level `grade` is the worse of the two loaded directions (whichever
saturated link adds more latency). Top-level fields are `null` when idle or
loaded latency was not measured. A direction field is `null` when that
direction's loaded latency is missing (for example, you ran a download-only test,
so `upload` is `null`).

### Diagnostics

`result.diagnostics` explains what the run actually did, which is what you want in
a support ticket or a bug report:

- `testSelection` - the phases and loaded-latency flags the run used.
- `requestedTransports` / `actualTransports` - the transport you asked for versus
  the one that ran (`"fetch-stream"` or `"xhr-chunked"`), per direction.
- `fallbackReasons` - why a transport fell back, if it did.

### Runtime upload fallback

Some browsers advertise fetch request streaming but reject it on the wire. Chrome,
for example, refuses streaming uploads over HTTP/1.1, so on a plain HTTP
deployment fetch-stream upload fails on every run. When `test.upload.allowFallback`
is on and XHR upload is available, the engine reruns the upload phase on
`xhr-chunked`. Before the retry it emits `phase-reset` for `upload`, because the
samples the failed attempt emitted do not describe the measurement that counts.

When the `xhr-chunked` retry succeeds, the engine instance remembers the
fetch-stream failure. Later runs on the same engine go straight to `xhr-chunked`
and record a `fallbackReasons` entry saying that fetch upload streaming failed on
an earlier run, including the original error message. Create a new engine to try
fetch-stream again. When the retry fails too, the problem was not the transport
(a server error, for example), so nothing is remembered and the next run tries
fetch-stream again.

- `workersRequested` / `workersStarted` - parallel worker counts per direction.
- `capabilityReport` - which browser features were available (streaming, workers,
  abort support). `fetchRequestStreaming` is true only when the browser really
  streams request bodies, so Firefox and Safari report `false` and upload uses
  `xhr-chunked`. Chrome reports `true` but refuses streaming uploads over HTTP/1.1;
  that case is handled by the runtime upload fallback.
- `configSource` - where the config came from.
- `errors` - any `SpeedTestError`s collected during the run, including
  recoverable ones that did not fail the whole run.
- `submission` - present only if a submission was attempted; carries `ok` and an
  optional `status`/`message`.

## Result Records

`createResultRecord(result, options?)` wraps a completed `SpeedTestResult` in a
portable envelope built for leaving the browser: a POST body, a database row, a
message on a queue, an analytics event, an attachment on a support ticket, or a
saved file to compare against later.

It is worth being precise about what this function does, because the name can
mislead:

- It **does not run a test.** You pass it a result you already have.
- It **does not submit anything.** It returns an object. Sending that object is
  your job (see the `fetch` example below). The production app calls
  `createResultRecord` when `config.result.submitUrl` is set and then POSTs the
  returned JSON to that URL, but the function itself performs no network I/O.
- It **does not mutate your result.** It `structuredClone`s the result into the
  record, so the record is safe to serialize, store, or modify without disturbing
  the live result your UI is still rendering.

### Why a record instead of the raw result

A `SpeedTestResult` is the raw in-memory output of one run. A
`SpeedTestResultRecord` is the storage and submission envelope around it. The
envelope adds the things a stored or transmitted result needs that the raw result
does not carry:

```ts
interface SpeedTestResultRecord<TContext = Record<string, unknown>> {
  schemaVersion: "comet-result-record/v1";
  createdAt: string; // ISO timestamp
  result: SpeedTestResult; // a clone of the run result
  selectedTarget?: TargetProfileSummary;
  context?: TContext;
  privacy: {
    rawSamples: "included" | "stripped" | "not-present";
  };
}
```

- `schemaVersion` is a constant (`"comet-result-record/v1"`). Store it so a
  consumer reading old rows can branch on the version.
- `createdAt` marks when the record was created, distinct from the run's own
  `startedAt`/`completedAt`.
- `selectedTarget` identifies which target profile produced the result. Set it
  when a deployment chooses between several endpoint locations, so a stored
  result records which server it measured against.
- `context` is caller-owned metadata: an `accountId`, a `region`, an app version,
  a deployment id, a plan id or whatever you need to correlate results in your own
  system. It is typed by the `TContext` generic so you get type checking on your
  own shape. Do not put secrets, auth tokens, or unnecessary personal data here;
  the record is meant to travel and may be stored.
- `privacy.rawSamples` records what happened to the per-sample data (see below).

### Raw samples: strip or preserve

The `rawSamples` option controls whether the copied result keeps its per-sample
and per-window arrays:

- `"strip"` removes `samples` and `windows` from the `download` and `upload`
  results in the copy, and empties `samples` in each latency bucket (`idle`,
  `underDownloadLoad`, `underUploadLoad`). The summary numbers stay.
  `privacy.rawSamples` becomes `"stripped"`.
- `"preserve"` (the default when you do not pass the option, behaving as
  preserve) keeps them. `privacy.rawSamples` becomes `"included"` if the result
  actually had raw samples (throughput or latency), or `"not-present"` if it never
  had any to begin with.

Prefer `"strip"` for anything you submit or store at volume. Raw samples make
payloads larger and describe the moment-to-moment behavior of the connection in
detail, which is more identifying than the summary numbers. Keep them only when
you specifically need per-sample diagnostics - for instance, debugging a
particular run.

### A realistic submission

```ts
import { createResultRecord } from "@comet-speedtest/core";
import type { SpeedTestResult } from "@comet-speedtest/core";

interface AppContext {
  accountId: string;
  region: string;
  appVersion: string;
}

async function submitResult(result: SpeedTestResult): Promise<void> {
  const record = createResultRecord<AppContext>(result, {
    rawSamples: "strip",
    selectedTarget: { id: "iad", label: "Ashburn" },
    context: {
      accountId: "acct_123",
      region: "us-east",
      appVersion: "2.4.0",
    },
  });

  const response = await fetch("https://api.example.com/speed-results", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(record),
  });

  if (!response.ok) {
    throw new Error(`Submission failed: ${response.status}`);
  }
}
```

For tests or server-issued timestamps, pass `createdAt` so the record is
deterministic instead of stamped with the current time:

```ts
const record = createResultRecord(result, {
  rawSamples: "strip",
  createdAt: "2026-01-01T00:00:00.000Z",
});
```

## Comparing against a plan

`compareAgainstPlan` answers "is this connection delivering the speed it is
supposed to?" Pass the result and the advertised plan; it returns a verdict.

```ts
import { compareAgainstPlan } from "@comet-speedtest/core";

const comparison = compareAgainstPlan(result, {
  downloadMbps: 100,
  uploadMbps: 20,
  acceptableRatio: 0.8, // default; measured must be at least 80% of advertised
});

// comparison.status is "meets-plan" | "below-plan" | "unknown"
// comparison.downloadRatio / uploadRatio are measured / expected, or null
// comparison.limitingMetrics lists which directions fell short
```

The result is `comet-plan-comparison/v1`. `status` is `"unknown"` when you did not
supply an expected value for a direction, or when a required direction has no
measured number (for example, the phase did not run). `acceptableRatio` defaults
to `0.8`; lower it if you want to be more forgiving. `expected` and `measured`
echo the numbers used so you can show "got 78 of 100 Mbps".

## Scoring connection quality

`scoreConnectionQuality` rates a result for everyday activities rather than as raw
numbers. Use it when "is this good enough for video calls?" is a more useful
answer than "this is 43 Mbps".

```ts
import { scoreConnectionQuality } from "@comet-speedtest/core";

const quality = scoreConnectionQuality(result);

console.log(quality.overall.grade); // "excellent" | "good" | "fair" | "poor" | "unknown"
console.log(quality.gaming.score); // 0-100, or null
console.log(quality.videoCalling.explanation); // human-readable summary
```

The result is `comet-quality/v1`. It has an `overall` score plus four activity
scores: `webBrowsing`, `gaming`, `streaming`, and `videoCalling`. Each is a
`QualityScore`:

```ts
interface QualityScore {
  score: number | null; // 0-100, null when inputs are missing
  grade: "excellent" | "good" | "fair" | "poor" | "unknown";
  limitingFactors: string[]; // e.g. "loaded-latency", "jitter", "upload"
  explanation: string; // one-sentence summary
}
```

Each activity weights the underlying metrics differently - streaming leans on
download throughput, while gaming and video calling lean on latency and jitter. `limitingFactors` names what dragged a score down, which is useful
for telling a user _why_ their connection is only "fair" for gaming.
`quality.inputs` echoes the raw numbers (download/upload Mbps, idle and loaded
latency, jitter, bufferbloat grade) the scores were derived from.

An activity needs every input it is scored from:

| Score          | Required inputs                                                     |
| -------------- | ------------------------------------------------------------------- |
| `webBrowsing`  | download, idle latency, loaded latency, bufferbloat                 |
| `gaming`       | download, upload, idle latency, loaded latency, jitter, bufferbloat |
| `streaming`    | download, loaded latency, jitter                                    |
| `videoCalling` | download, upload, loaded latency, jitter                            |
| `overall`      | all four activity scores                                            |

Loaded latency needs a download or upload phase with loaded-latency probes on;
it is the worse of the two directions. Bufferbloat needs both idle and loaded
latency. Jitter needs idle or loaded latency. If any required input is missing,
the score is `null`, the grade is `"unknown"`, and `explanation` lists what the
run did not produce. A download-only run with loaded-latency probes scores
`streaming` and leaves the other activities `"unknown"` instead of rating them
from a subset of their inputs.

`gradeBufferbloat` is also exported from the root if you want to grade
bufferbloat numbers directly, but `result.bufferbloat` already carries the grade
for a completed run.

## Testing your integration

For deterministic tests, import from `@comet-speedtest/core/testing`. The
synthetic adapter replaces the network, so a test runs in Node or a browser
without real endpoints:

```ts
import {
  createTestSpeedTest,
  SyntheticMeasurementAdapter,
} from "@comet-speedtest/core/testing";

const engine = createTestSpeedTest(config, {
  measurementAdapter: new SyntheticMeasurementAdapter(),
});

const outcome = await engine.run();
// outcome.ok is true, and the same config always gives the same measurements.
```

With a measurement adapter, the engine:

- takes idle latency, download, upload, and latency under load from the adapter
  and never calls `fetch` or starts a Worker;
- skips the reachability check;
- produces identical measurements for identical config, because the synthetic
  adapter runs on a virtual clock. `runId`, `startedAt`, and `completedAt` still
  differ per run.

`createTestSpeedTest` has the same surface as `createSpeedTest` plus the
`measurementAdapter` option. It reports every transport as supported unless you
pass `capabilities`, so a test resolves the same transports as a modern browser
whatever runtime it runs in. Pass a full `capabilities` report to test a
fallback. This one makes upload use `xhr-chunked`:

```ts
const engine = createTestSpeedTest(config, {
  measurementAdapter: new SyntheticMeasurementAdapter(),
  capabilities: {
    fetchResponseStreaming: true,
    fetchRequestStreaming: false,
    xhrUpload: true,
    workers: true,
    abortController: true,
  },
});
```

To simulate a failure, implement `DeterministicPhaseAdapter` yourself and
delegate to the synthetic adapter for the parts you don't change. An adapter
provides both `runIdleLatency` and `runPhase`:

```ts
import type { DeterministicPhaseAdapter } from "@comet-speedtest/core/testing";

const synthetic = new SyntheticMeasurementAdapter();
const failingUpload: DeterministicPhaseAdapter = {
  runIdleLatency: (options) => synthetic.runIdleLatency(options),
  runPhase: (options) =>
    options.phase === "upload"
      ? Promise.reject(new Error("HTTP 503"))
      : synthetic.runPhase(options),
};
// createTestSpeedTest(config, { measurementAdapter: failingUpload }).run()
// resolves to { ok: false, error: { code: "upload-failed" } }.
```

Keep these helpers in test code: the root `createSpeedTest` intentionally does
not accept an adapter, so production paths cannot quietly run against synthetic
data.

## Lower-level diagnostics

`@comet-speedtest/core/diagnostics` exposes the pieces the engine composes. The
most commonly useful one is `selectTarget`, which probes several candidate
endpoints and picks one (for example, the lowest-latency server) before a run:

```ts
import { selectTarget } from "@comet-speedtest/core/diagnostics";

const selection = await selectTarget({
  targets: [
    {
      id: "iad",
      label: "Ashburn",
      targets: {
        download: "https://iad.example.com/download.bin",
        upload: "https://iad.example.com/upload",
      },
    },
    {
      id: "sfo",
      label: "San Francisco",
      targets: {
        download: "https://sfo.example.com/download.bin",
        upload: "https://sfo.example.com/upload",
      },
    },
  ],
});

// selection.selected is the chosen profile; selection.targets are its URLs.
// selection.diagnostics.candidates explains the per-candidate latency.
```

This subpath also exports `detectCapabilities`, `resolveTransports`,
`aggregateLatency`, `percentile`, and `buildWindows` for callers building their
own measurement flow. Most apps never need them.

## Common mistakes

- **Reading `result.download.bitsPerSecond` without a null check.** `download`
  and `upload` are `null` for skipped or failed phases. Always guard.
- **Wrapping `run()` in `try/catch` to handle measurement failures.** Those are
  returned as `{ ok: false }`. The only thing `run()` throws for is starting a
  second concurrent run.
- **Treating `bitsPerSecond` as bytes or as Mbps.** It is bits per second; divide
  by `1_000_000` for Mbps.
- **Submitting records with raw samples by default.** Use `rawSamples: "strip"`
  for stored or transmitted records unless you specifically need per-sample data.
- **Putting secrets in `context`.** The record is meant to travel and be stored.
- **Forgetting `baseUrl` when endpoints are not same-origin.** Relative target
  URLs resolve against the page in a browser; set `baseUrl` if your endpoints
  live elsewhere.
- **Importing test helpers in production code.** `createTestSpeedTest` and the
  synthetic adapter belong in `@comet-speedtest/core/testing`, used from tests
  only.
