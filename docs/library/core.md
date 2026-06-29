# @comet-speedtest/core

`@comet-speedtest/core` runs a browser speed test and returns a typed result. It owns
the speed-test run lifecycle: target reachability, idle latency, download,
upload, latency under load, diagnostics, and final scoring.

The root entry point is for production callers. Diagnostic helpers and test-only
adapters live on subpaths.

## Install

```sh
pnpm add @comet-speedtest/core @comet-speedtest/config
```

## Create A Speed Test

```ts
import { createSpeedTest } from "@comet-speedtest/core";

const engine = createSpeedTest({
  targets: {
    download: "/speedtest/download/large.bin",
    upload: "/speedtest/upload",
    latency: "/speedtest/latency",
  },
});
```

Relative target URLs are resolved against the current page by default. Pass
`baseUrl` when you need a different base.

```ts
const engine = createSpeedTest(config, {
  baseUrl: "https://speed.example.com/",
});
```

## Listen For Events

```ts
const unsubscribe = engine.on("sample", (event) => {
  console.log(event.sample.phase, event.sample.bitsPerSecond);
});

engine.on("latency-sample", (event) => {
  console.log(event.sample.latencyMs);
});

unsubscribe();
```

Useful events:

- `start`: a run started.
- `phase-start`: idle latency, download, upload, or finalize started.
- `sample`: throughput sample.
- `window`: measured throughput window.
- `latency-sample`: idle or loaded latency sample.
- `phase-complete`: one phase completed.
- `result`: the run completed.
- `error`: the run failed or was stopped.

## Run The Test

```ts
const outcome = await engine.run();

if (outcome.ok) {
  console.log(outcome.result.download?.bitsPerSecond);
} else {
  console.error(outcome.error.message);
  console.log(outcome.partial);
}
```

Measurement failures are returned as values. `run()` only throws for caller
misuse, such as starting a second run while one is still active.

Stop an active run with:

```ts
engine.stop("User stopped the run.");
```

## Select Phases Per Run

Runtime config can set default phases under `test.selection`. A caller can also
select phases for one run:

```ts
await engine.run({
  selection: {
    phases: ["download"],
    loadedLatency: false,
  },
});
```

Skipped result buckets are `null`. Check `result.download`, `result.upload`, and
each latency bucket before rendering them.

## Results

The final `SpeedTestResult` includes:

- `download` and `upload` throughput results.
- `latency.idle`, `latency.underDownloadLoad`, and
  `latency.underUploadLoad`.
- `bufferbloat` grade and added latency.
- `diagnostics`, including selected transports, capability report, fallback
  reasons, worker counts, and config source.

Create a portable result payload for storage or submission:

```ts
import { createResultRecord } from "@comet-speedtest/core";

const record = createResultRecord(result, {
  rawSamples: "strip",
});
```

## Diagnostics Entry Point

Use `@comet-speedtest/core/diagnostics` for lower-level tools:

```ts
import { selectTarget } from "@comet-speedtest/core/diagnostics";

const selected = await selectTarget({
  targets: [
    {
      id: "iad",
      label: "Ashburn",
      targets: {
        download: "https://iad.example.com/download.bin",
        upload: "https://iad.example.com/upload",
      },
    },
  ],
});
```

This subpath also exports helpers for capability detection, transport
resolution, latency aggregation, percentiles, and throughput windows.

## Testing Entry Point

Use `@comet-speedtest/core/testing` when tests need deterministic measurements:

```ts
import {
  createTestSpeedTest,
  SyntheticMeasurementAdapter,
} from "@comet-speedtest/core/testing";

const engine = createTestSpeedTest(config, {
  measurementAdapter: new SyntheticMeasurementAdapter(),
});
```

The root entry point does not accept measurement adapters. That keeps production
callers on the speed-test/result surface and keeps test-only behavior explicit.
