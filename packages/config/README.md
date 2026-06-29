# @comet-speedtest/config

Runtime config helpers for Comet.

The package owns the JSON-compatible deployment input used by the production app
and by library callers: defaults, validation, normalization, config loading, test
phase selection, and export helpers.

## Install

```sh
pnpm add @comet-speedtest/config
```

## Basic Use

```ts
import { loadAndNormalizeConfig, validateConfig } from "@comet-speedtest/config";

const validation = validateConfig({
  targets: {
    download: "/speedtest/download/large.bin",
    upload: "/speedtest/upload",
  },
});

if (!validation.ok) {
  console.error(validation.issues);
}

const config = await loadAndNormalizeConfig({
  url: "/comet.config.json",
});

console.log(config.targets.download);
```

## Target Profiles

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

## Phase Selection

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

## Compatibility

Known malformed sections fail validation. Unknown fields are kept as warnings in
normal mode and become errors only when strict validation is requested.

Full project docs live in `docs/library/config.md` in the Comet repository.
