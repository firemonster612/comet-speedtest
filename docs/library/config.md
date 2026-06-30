# @comet-speedtest/config

`@comet-speedtest/config` owns the JSON-compatible runtime config that drives a
Comet speed test. It is the input the production app reads from a deployment file,
and the same shape custom clients pass to `@comet-speedtest/core`. The package
provides the defaults, the validation, the normalization, the file loading, and
the export helpers so you do not have to hand-roll any of it.

This is the full guide. The npm README at `packages/config/README.md` is a
shorter version of the same material.

## Mental model

There are two config shapes, and the distinction matters:

- **`RuntimeConfig`** is the loose, author-facing shape. Almost every field is
  optional. This is what a person writes in `comet.config.json`, and what
  `validateConfig` checks.
- **`NormalizedSpeedTestConfig`** is the strict, engine-facing shape. Every field
  is present, relative URLs are resolved to absolute, the theme is fully
  expanded, and the object is deep-frozen. This is what `createSpeedTest` actually
  runs against.

`normalizeConfig` turns the first into the second. `createSpeedTest` can do that
normalization internally, so a small custom client can pass a `RuntimeConfig`
straight to the engine:

```ts
const engine = createSpeedTest(runtimeConfig);
```

Normalize manually when your app needs to do something with the normalized config
before or outside the run:

- show validation errors or unknown-field warnings before creating the engine.
- resolve and inspect the final target URLs.
- read the `configHash` or `diagnostics.source` for logs, support tickets, or
  result grouping.
- select a target profile and rebuild the config for that target.
- cache, export, or hand the same frozen config to more than one engine.

```ts
const config = await loadAndNormalizeConfig({ url: "/comet.config.json" });
const engine = createSpeedTest(config);
```

Both paths run the same normalization logic. The difference is ownership: passing
raw config to `createSpeedTest` is the convenience path, while manual
normalization gives your app a chance to inspect and use the normalized shape
directly. Normalization fills defaults, resolves relative target URLs against a
base URL, records provenance under `diagnostics` (`source`, `configHash`,
`unknownFields`, `normalizedAt`), and freezes the result so nothing mutates it
after the fact.

## Install

```sh
pnpm add @comet-speedtest/config
```

## A minimal config

The only required fields are the download and upload targets:

```ts
import { normalizeConfig } from "@comet-speedtest/config";

const config = normalizeConfig({
  targets: {
    download: "/speedtest/download/large.bin",
    upload: "/speedtest/upload",
  },
});
```

`targets.latency` is optional; when omitted it defaults to the download target.
Everything else (theme, content, test knobs, result submission) takes documented
defaults, so the minimal target config is a complete config.

## Validation vs normalization

These are two different operations and you will use both.

**`validateConfig(input)`** accepts `unknown` and never throws. It tells you
whether a config is usable and what is wrong with it:

```ts
import { validateConfig } from "@comet-speedtest/config";

const validation = validateConfig(untrustedInput);

if (!validation.ok) {
  // validation.issues: { path, message, severity: "error" | "warning" }[]
  for (const issue of validation.issues) {
    console.error(`${issue.path}: ${issue.message}`);
  }
}

// Fields the schema does not recognize, regardless of ok.
console.log(validation.unknownFields);
```

Use `validateConfig` when the input is untrusted - a pasted blob, an uploaded
file, a form - and you want to report problems without crashing.

**`normalizeConfig(config, options?)`** validates and then builds the strict
shape. It **throws** a `RuntimeConfigError` if a known section is malformed:

```ts
import { normalizeConfig, RuntimeConfigError } from "@comet-speedtest/config";

try {
  const config = normalizeConfig(input, { source: "comet.config.json" });
} catch (error) {
  if (error instanceof RuntimeConfigError) {
    console.error(error.message);
  }
}
```

Unknown fields are tolerated by default - they are reported as warnings and
carried in `diagnostics.unknownFields` so a deployment can ship forward-compatible
data without breaking. If you want unknown fields to be a hard error, pass
`strict: true`:

```ts
normalizeConfig(input, { strict: true }); // unknown fields now throw
```

The rule of thumb: validate when you want to inspect and report; normalize when
you are ready to run and want defaults filled in.

### baseUrl and relative URLs

`normalizeConfig` resolves relative target URLs (and a relative
`result.submitUrl`) against a base URL. Pass it explicitly:

```ts
const config = normalizeConfig(input, {
  baseUrl: "https://speed.example.com/",
});
```

When you do not pass `baseUrl`, the default is `location.href` in a browser and
`http://localhost/` outside a browser. A config full of relative URLs is portable
across deployments precisely because the base is supplied at normalization time,
not baked into the file. If your test endpoints live on a different origin than
the page, either write absolute URLs in the config or pass the matching
`baseUrl`.

## Loading /comet.config.json

The production app and most custom clients keep their config in a file served at
`/comet.config.json`. Two helpers fetch it:

`loadRuntimeConfig` fetches and parses JSON only. It returns the loose
`RuntimeConfig` and does not normalize:

```ts
import { loadRuntimeConfig } from "@comet-speedtest/config";

const runtime = await loadRuntimeConfig({ url: "/comet.config.json" });
```

`loadAndNormalizeConfig` fetches and normalizes in one step, returning the strict
shape ready for `createSpeedTest`:

```ts
import { loadAndNormalizeConfig } from "@comet-speedtest/config";

const config = await loadAndNormalizeConfig({ url: "/comet.config.json" });
console.log(config.targets.download); // absolute URL
```

Both default `url` to `/comet.config.json`, so you can call them with no
arguments. Both accept an `AbortSignal` for cancellation:

```ts
const controller = new AbortController();

const config = await loadAndNormalizeConfig({
  url: "/comet.config.json",
  signal: controller.signal,
});
```

`loadAndNormalizeConfig` also accepts `source` (defaults to the URL, recorded in
diagnostics), `baseUrl`, and `strict`. A fetch that fails or returns invalid JSON
throws a `RuntimeConfigError`.

## Targets

`targets` is the one required section:

```ts
interface RuntimeTargets {
  download: string; // serves a large static file
  upload: string; // accepts and discards the request body
  latency?: string; // responds quickly to HEAD/GET; defaults to download
}
```

The endpoints your config points at must behave a specific way:

- **download** serves a large static file. The run streams it and measures how
  fast it arrives.
- **upload** accepts a request body and discards it. The run sends bytes and
  measures how fast they leave. It does not need to store anything.
- **latency** responds quickly to a `HEAD` or `GET`. The run measures round-trip
  time. If you omit it, the download URL is used.

Prefer same-origin endpoints. They avoid CORS entirely. If your endpoints are
cross-origin, configure CORS on them carefully - the browser will block the run
otherwise.

## Target profiles

A target profile is a named set of endpoints. Profiles let one deployment offer
several server locations and choose between them at run time, instead of
hard-coding one server.

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
    {
      id: "sfo",
      label: "San Francisco",
      targets: {
        download: "https://sfo.example.com/download.bin",
        upload: "https://sfo.example.com/upload",
        latency: "https://sfo.example.com/latency",
      },
    },
  ],
  targetSelection: {
    strategy: "lowest-latency",
  },
});
```

`targetSelection.strategy` is either `"lowest-latency"` (probe each profile and
pick the fastest to respond) or `"forced"` (always use a specific profile, named
by `targetId`). The top-level `targets` stays as the fallback used when no profile
is selected.

Selection itself lives in `@comet-speedtest/core/diagnostics` (`selectTarget`).
Once a profile is chosen, `normalizeConfigWithTargets` rebuilds the normalized
config to run against the chosen profile's endpoints:

```ts
import { normalizeConfigWithTargets } from "@comet-speedtest/config";

const configForRun = normalizeConfigWithTargets(config, selection.targets);
```

## Phase selection

`test.selection` sets which phases run by default and whether latency is sampled
under load:

```ts
const config = normalizeConfig({
  targets: {
    download: "/speedtest/download/large.bin",
    upload: "/speedtest/upload",
  },
  test: {
    selection: {
      phases: ["idle-latency", "download"],
      loadedLatency: { download: true, upload: false },
    },
  },
});
```

`phases` is any subset of `"idle-latency"`, `"download"`, `"upload"`.
`loadedLatency` is a single boolean (both directions) or per-direction flags. The
default selection runs all three phases with loaded latency on for both
directions. A caller can override this per run via `engine.run({ selection })`
(see `docs/library/core.md`); the config sets the default.

## Test knobs

`test` also carries the measurement parameters. All have defaults, so set only
what you need to change.

- `test.download` - `workers` (default 4), `transport` (`"auto"` by default),
  `maxDurationMs`, `firstByteTimeoutMs`.
- `test.upload` - `workers` (default 4), `transport` (`"auto"`), and
  fallback-related fields (`allowFallback`, `fallbackTransport`, chunk sizes),
  plus `maxDurationMs` and `firstByteTimeoutMs`.
- `test.sampling` - `intervalMs`, `samplesPerWindow`, `measuredWindowCount`,
  `warmupWindowCount`, `percentile`, `includePartialWindowAtLeastRatio`.
- `test.latency` - `idleRequests`, `loadedIntervalMs`, `timeoutMs`, `method`
  (`"HEAD"` or `"GET"`), `enabled` (latency phase on by default), and
  `reachabilityCheck` (a single pre-flight probe per target that fails the run
  fast if a target cannot be reached at all; independent of `enabled`).

The two flags worth knowing without reading the schema: download and upload each
use 4 parallel workers by default, and transport is `"auto"` (the engine picks
the best available and falls back if needed, recording the reason in the result
diagnostics).

## Result submission

`result` controls what happens with a finished run's record:

```ts
interface RuntimeResultConfig {
  submitUrl?: string | null; // default null: no submission
  includeRawSamples?: boolean; // default false
}
```

When `submitUrl` is set, the production app builds a result record (see
`createResultRecord` in `docs/library/core.md`) and POSTs it as JSON to that URL.
A relative `submitUrl` is resolved against the base URL during normalization, the
same as target URLs. When `submitUrl` is `null` (the default), no submission
happens. `includeRawSamples` defaults to `false`; leave it off unless a downstream
consumer needs per-sample detail, since raw samples make payloads larger and more
identifying.

## Other config sections

A full `RuntimeConfig` also carries presentation settings the production app uses.
The library does not need them to run a test, but they are part of the same file:

- `brand` - `name`, `logoUrl`, `faviconUrl`, `serverLabel`.
- `theme` - `colorScheme` (`"light" | "dark" | "system"`), `light` and `dark`
  palettes, `fontFamily`, `radius`.
- `content` - the UI copy (`title`, `subtitle`, button labels, status strings).

`$schema` is allowed at the top level and ignored by normalization.

## A realistic /comet.config.json

```json
{
  "brand": {
    "name": "Acme Speed",
    "serverLabel": "Acme Ashburn"
  },
  "theme": {
    "colorScheme": "system"
  },
  "content": {
    "title": "Acme Internet Speed Test",
    "subtitle": "Check your download, upload, and latency."
  },
  "targets": {
    "download": "/speedtest/download/large.bin",
    "upload": "/speedtest/upload",
    "latency": "/speedtest/latency"
  },
  "test": {
    "download": { "workers": 4 },
    "upload": { "workers": 4 },
    "selection": {
      "phases": ["idle-latency", "download", "upload"],
      "loadedLatency": { "download": true, "upload": true }
    }
  },
  "result": {
    "submitUrl": "/api/speed-results",
    "includeRawSamples": false
  }
}
```

This uses same-origin endpoints (no CORS to configure), runs all three phases with
loaded latency, and submits a stripped result record to a same-origin API.

## Exporting config

`exportConfig` serializes a config back to JSON text, formatted with two-space
indentation and a trailing newline, ready to write as `comet.config.json`:

```ts
import { exportConfig } from "@comet-speedtest/config";

const json = exportConfig(config);
// write `json` to comet.config.json
```

It accepts either a `RuntimeConfig` or a `NormalizedSpeedTestConfig`. Given a
normalized config it strips the `diagnostics` block so the output is a clean
runtime file. This is useful for a config editor: load, edit, normalize to
validate, then export the runtime shape.

`defaultRuntimeConfig` is also exported if you want to start from the built-in
defaults and override selectively.

## Common mistakes

- **Calling `normalizeConfig` on untrusted input and not catching.** It throws on
  malformed known sections. Use `validateConfig` first when the input might be
  bad, or wrap the call.
- **Expecting unknown fields to fail by default.** They do not - they are
  warnings carried in `diagnostics.unknownFields`. Pass `strict: true` to make
  them errors.
- **Forgetting that `targets.latency` defaults to `targets.download`.** If you
  want a dedicated latency endpoint, set it explicitly.
- **Pointing at cross-origin endpoints without CORS.** Same-origin endpoints
  avoid the problem; cross-origin ones need CORS configured on the server.
- **Assuming relative URLs resolve against the config file's location.** They
  resolve against `baseUrl` (the page, by default). Set `baseUrl` when that is
  not what you want.
