# @comet-speedtest/config

Configuration loading, validation, and normalization for Comet speed tests. This
package owns the JSON-compatible deployment input used by the production app and
by custom library clients.

This is the npm quick reference. The full guide lives in
[`docs/library/config.md`](../../docs/library/config.md).

## Install

```sh
pnpm add @comet-speedtest/config
```

## Mental model

There are two config shapes:

- **`RuntimeConfig`** is the raw, author-facing shape. This is what a person
  writes in `comet.config.json`, what a config editor manipulates, and what
  `validateConfig` checks. Most fields are optional, and URLs may be relative.
- **`NormalizedSpeedTestConfig`** is the engine-facing shape produced by
  `normalizeConfig`. Defaults are filled, relative URLs are resolved, diagnostics
  are recorded, and the object is deep-frozen.

You can pass either shape to `createSpeedTest` from `@comet-speedtest/core`.
Passing a raw `RuntimeConfig` is the convenience path for a small custom client;
the engine runs the same normalization internally.

Normalize manually when your app needs to inspect or reuse the normalized config
before a run: showing validation errors, checking final target URLs, reading the
`configHash`, selecting a target profile, caching the frozen config, or exporting
the config back to JSON.

## Minimal config

`targets.download` and `targets.upload` are required. `targets.latency` is
optional and defaults to the download target. Everything else has defaults.

```ts
import { normalizeConfig } from "@comet-speedtest/config";

const config = normalizeConfig({
  targets: {
    download: "/speedtest/download/large.bin",
    upload: "/speedtest/upload",
  },
});
```

## Validation vs normalization

Use `validateConfig(input)` when the input is untrusted and you want a
non-throwing result:

```ts
import { validateConfig } from "@comet-speedtest/config";

const validation = validateConfig(unknownInput);

if (!validation.ok) {
  for (const issue of validation.issues) {
    console.error(`${issue.path}: ${issue.message}`);
  }
}
```

`validateConfig` accepts `unknown` and never throws.

Use `normalizeConfig(config, options?)` when you are ready to run:

```ts
import { normalizeConfig, RuntimeConfigError } from "@comet-speedtest/config";

try {
  const config = normalizeConfig(runtimeConfig, {
    baseUrl: "https://speed.example.com/",
    source: "comet.config.json",
  });
} catch (error) {
  if (error instanceof RuntimeConfigError) {
    console.error(error.message);
  }
}
```

Normalization validates known sections, fills defaults, resolves relative target
URLs and `result.submitUrl`, records diagnostics, and deep-freezes the result. It
throws `RuntimeConfigError` when a known section is malformed. Unknown fields are
warnings by default; pass `strict: true` to make them hard errors.

## Loading /comet.config.json

The loader helpers are deliberately split:

- `loadRuntimeConfig` fetches and parses JSON only. It returns a raw
  `RuntimeConfig`.
- `loadAndNormalizeConfig` fetches and normalizes. It returns a
  `NormalizedSpeedTestConfig` ready for the engine.

```ts
import { loadAndNormalizeConfig } from "@comet-speedtest/config";

const config = await loadAndNormalizeConfig({
  url: "/comet.config.json",
});

console.log(config.targets.download); // absolute URL
```

Both helpers default to `/comet.config.json` and accept an `AbortSignal`.

## Targets

`targets` declares the endpoints exercised during a run:

```ts
interface RuntimeTargets {
  download: string; // serves a large static file
  upload: string; // accepts and discards the request body
  latency?: string; // responds quickly to HEAD/GET; defaults to download
}
```

Prefer same-origin endpoints so the browser does not need CORS. If your endpoints
are cross-origin, configure CORS on the server before expecting a browser run to
work.

## Target profiles

Target profiles let one deployment offer several endpoint sets, usually server
locations, and choose between them at run time.

```ts
import { normalizeConfig } from "@comet-speedtest/config";

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

`targetSelection.strategy` is `"lowest-latency"` or `"forced"`. For a forced
selection, also set `targetId`.

## Phase selection

`test.selection` controls which phases run by default and whether loaded latency
is measured:

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

The default selection runs idle latency, download, and upload, with loaded
latency measured during both throughput phases.

## Result submission config

The production app uses the `result` section after a successful run:

```ts
interface RuntimeResultConfig {
  submitUrl?: string | null;
  includeRawSamples?: boolean;
}
```

When `submitUrl` is set, the production app creates a result record and POSTs it
as JSON to that URL. A relative `submitUrl` is resolved during normalization.
`includeRawSamples` defaults to `false`; leave it off unless the receiving system
needs per-sample diagnostics.

## Exporting config

`exportConfig` serializes a runtime or normalized config back to JSON text:

```ts
import { exportConfig } from "@comet-speedtest/config";

const json = exportConfig(config);
```

When given a normalized config, it strips diagnostics so the output is suitable
for `comet.config.json`.

## Common mistakes

- **Omitting `targets.download` or `targets.upload`.** Both are required.
- **Calling `normalizeConfig` on untrusted input without catching.** It throws for
  malformed known sections. Use `validateConfig` first when you need a
  non-throwing check.
- **Expecting unknown fields to fail by default.** They are warnings unless you
  pass `strict: true`.
- **Using `loadRuntimeConfig` when you need a ready config.** It only fetches and
  parses. Use `loadAndNormalizeConfig` when the engine needs the result.
- **Assuming relative URLs resolve against the config file.** They resolve
  against `baseUrl`, or the current page in a browser.
- **Enabling raw samples by default.** `result.includeRawSamples` is `false` for a
  reason; raw samples increase payload size and reveal more per-run detail.
