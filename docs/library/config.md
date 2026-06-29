# @comet-speedtest/config

`@comet-speedtest/config` owns the JSON-compatible runtime config used by the
production app and by custom clients.

It covers:

- brand and copy.
- light and dark theme tokens.
- target URLs and target profiles.
- test settings for download, upload, sampling, latency, and phase selection.
- result submission settings.

## Install

```sh
pnpm add @comet-speedtest/config
```

## Minimal Config

```ts
import { normalizeConfig } from "@comet-speedtest/config";

const config = normalizeConfig({
  targets: {
    download: "/speedtest/download/large.bin",
    upload: "/speedtest/upload",
  },
});
```

`latency` defaults to the download target when it is not set.

## Validation

```ts
import { validateConfig } from "@comet-speedtest/config";

const validation = validateConfig(runtimeConfig);

if (!validation.ok) {
  console.log(validation.issues);
}

console.log(validation.unknownFields);
```

Malformed known sections fail validation. Unknown fields are warnings by default
so deployments can carry forward-compatible data. Pass `strict: true` to
`normalizeConfig` when unknown fields should fail.

```ts
normalizeConfig(runtimeConfig, { strict: true });
```

## Loading A Config File

```ts
import { loadAndNormalizeConfig } from "@comet-speedtest/config";

const config = await loadAndNormalizeConfig({
  url: "/comet.config.json",
});
```

This fetches JSON and normalizes it in one step. Pass an `AbortSignal` if the
caller owns cancellation.

```ts
const controller = new AbortController();

const config = await loadAndNormalizeConfig({
  url: "/comet.config.json",
  signal: controller.signal,
});
```

## Target Profiles

Target profiles let a deployment list several endpoint sets and choose one
before the run starts.

```ts
const config = normalizeConfig({
  targets: {
    download: "/fallback/download.bin",
    upload: "/fallback/upload",
  },
  targetProfiles: [
    {
      id: "iad",
      label: "Ashburn",
      targets: {
        download: "https://iad.example.com/download.bin",
        upload: "https://iad.example.com/upload",
        latency: "https://iad.example.com/latency",
      },
    },
  ],
  targetSelection: {
    strategy: "lowest-latency",
  },
});
```

The production app uses `@comet-speedtest/core/diagnostics` to select a profile, then
calls `normalizeConfigWithTargets` to run against the chosen targets.

## Phase Selection

Use `test.selection` to choose which phases run by default.

```ts
const config = normalizeConfig({
  targets: {
    download: "/speedtest/download/large.bin",
    upload: "/speedtest/upload",
  },
  test: {
    selection: {
      phases: ["idle-latency", "download"],
      loadedLatency: {
        download: true,
        upload: false,
      },
    },
  },
});
```

Callers can override this for one run through `engine.run({ selection })`.

## Exporting Config

```ts
import { exportConfig } from "@comet-speedtest/config";

const json = exportConfig(config);
```

`exportConfig` returns formatted JSON with a trailing newline, ready to write as
`comet.config.json`.
