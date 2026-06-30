# Comet Library

Comet is a browser speed test split into two installable packages. This page
explains what each one is for and points you to the right guide for what you are
building.

- **`@comet-speedtest/core`** runs the test. It owns target reachability, idle
  latency, download, upload, latency under load, bufferbloat grading, and run
  diagnostics, and it turns a finished run into a typed `SpeedTestResult`. On top
  of that result it offers helpers that do not re-run anything:
  `createResultRecord` for storage and submission envelopes, `compareAgainstPlan`
  for plan checks, `scoreConnectionQuality` for activity-focused ratings, and
  `gradeBufferbloat` for direct bufferbloat grading. A separate
  `@comet-speedtest/core/testing` entry point provides deterministic test
  helpers.
- **`@comet-speedtest/config`** owns the JSON config that drives a run. It
  provides defaults, validation, normalization, `/comet.config.json` loading,
  target profiles, phase selection, result submission settings, and config export.
  It is the input the production app reads and the same shape a custom client
  hands to core.

You bring the configuration and the UI. The packages do the measurement and the
config plumbing.

## Package docs

The package READMEs (`packages/core/README.md`, `packages/config/README.md`) are
short npm quick references. The two files here are the full guides:

- [`core.md`](./core.md) covers running a test, events, outcomes, result records,
  plan comparison, quality scoring, diagnostics, and testing.
- [`config.md`](./config.md) covers the config shape, validation vs
  normalization, loading the config file, target profiles, phase selection, and
  result submission.

## Reference integration

The production app in [`apps/production`](../../apps/production) is the canonical
example. It is a deployable speed test that uses both packages together, so when
a doc says "the production app does this", you can read the actual integration.
Treat it as the worked reference for custom clients.

## What to read next

**Deploying the production app.** Read [`config.md`](./config.md) to write
`/comet.config.json`: targets, branding, theme, phase selection, and optional
`result.submitUrl`. The "A realistic /comet.config.json" section is the fastest
start.

**Building a custom UI.** Read [`core.md`](./core.md) first, especially
"Listening for events" and "Handling the outcome". Events (`sample`, `window`,
`latency-sample`, `phase-start`, `phase-complete`) drive a live progress UI, and
the `RunOutcome` carries the final numbers. Then skim [`config.md`](./config.md)
for `normalizeConfig` so you know what shape the engine runs.

**Accepting config JSON.** Read "Validation vs normalization" and "Loading
/comet.config.json" in [`config.md`](./config.md). Use `validateConfig` to inspect
untrusted input and report problems. Use `normalizeConfig`, or
`loadAndNormalizeConfig`, to fill defaults and produce the strict shape the
engine runs against.

**Submitting or storing results.** Read "Result Records" in [`core.md`](./core.md)
and "Result submission" in [`config.md`](./config.md). `createResultRecord`
builds the envelope. Sending it is your job. Prefer `rawSamples: "strip"` for
anything stored or transmitted at volume.

**Writing tests.** Read "Testing your integration" in [`core.md`](./core.md).
Import `createTestSpeedTest` and `SyntheticMeasurementAdapter` from
`@comet-speedtest/core/testing` for stable, network-free results. Keep these out
of production code: the root `createSpeedTest` does not accept an adapter on
purpose.

## A custom client, end to end

This is the full path from config file to submitted result. Each step is covered
in depth in the guides above.

```ts
import { loadAndNormalizeConfig } from "@comet-speedtest/config";
import { createResultRecord, createSpeedTest } from "@comet-speedtest/core";

const config = await loadAndNormalizeConfig({ url: "/comet.config.json" });
const engine = createSpeedTest(config);

const stopSamples = engine.on("sample", (event) => {
  // event.sample.phase is "download" | "upload".
  renderThroughput(event.sample.bitsPerSecond / 1_000_000);
});

const stopLatency = engine.on("latency-sample", (event) => {
  renderLatency(event.sample.latencyMs);
});

const outcome = await engine.run();
stopSamples();
stopLatency();

if (!outcome.ok) {
  // outcome.error.code is a known string. outcome.partial holds finished phases.
  showError(outcome.error.code, outcome.error.message);
} else {
  const result = outcome.result;
  renderResult(result);

  if (config.result.submitUrl) {
    const record = createResultRecord(result, { rawSamples: "strip" });
    await fetch(config.result.submitUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(record),
    });
  }
}
```

`run()` only throws if you start a second run while one is active, so guard
against double-clicks instead of using `try/catch` for normal measurement
failures. Throughput and latency buckets on the result are nullable because a
phase can be skipped or fail, so check before reading. Both points are detailed
in [`core.md`](./core.md).
