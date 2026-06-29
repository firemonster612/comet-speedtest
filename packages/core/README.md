# @comet-speedtest/core

Browser-first speed-test engine for custom clients.

The package owns the speed-test run: target reachability, download, upload,
latency under load, result records, diagnostics, plan comparison, connection
quality scoring, and bufferbloat grading.

## Install

```sh
pnpm add @comet-speedtest/core @comet-speedtest/config
```

`@comet-speedtest/config` is listed because most callers also want the runtime config
types and helpers.

## Basic Use

```ts
import { createSpeedTest } from "@comet-speedtest/core";

const engine = createSpeedTest({
  targets: {
    download: "/speedtest/download/large.bin",
    upload: "/speedtest/upload",
    latency: "/speedtest/latency",
  },
});

engine.on("sample", (event) => {
  console.log(event.sample.bitsPerSecond);
});

const outcome = await engine.run();

if (outcome.ok) {
  console.log(outcome.result.download?.bitsPerSecond);
} else {
  console.error(outcome.error.message);
}
```

Measurement failures are returned as values. `run()` only throws for caller
misuse, such as starting a second run while one is already active.

## Events

```ts
const unsubscribe = engine.on("sample", (event) => {
  console.log(event.sample.phase, event.sample.bitsPerSecond);
});

engine.on("result", (event) => {
  console.log(event.result.bufferbloat.grade);
});

unsubscribe();
```

Events cover run start, phase changes, throughput samples, throughput windows,
latency samples, phase completion, final result, and run errors.

## Selected Phases

```ts
await engine.run({
  selection: {
    phases: ["download"],
    loadedLatency: false,
  },
});
```

Skipped result buckets are `null`.

## Result Records

```ts
import { createResultRecord } from "@comet-speedtest/core";

const record = createResultRecord(result, {
  rawSamples: "strip",
});
```

## Public Entry Points

- `@comet-speedtest/core`: production speed-test and result Interface.
- `@comet-speedtest/core/diagnostics`: lower-level diagnostic helpers.
- `@comet-speedtest/core/testing`: deterministic adapters for tests.

Worker and measurement adapters stay out of the root entry point. If a test
needs a deterministic run, import `createTestSpeedTest` from
`@comet-speedtest/core/testing`.

Full project docs live in `docs/library/core.md` in the Comet repository.
