# Release Scope

Comet currently has two release tracks:

- Published library Modules: `@comet-speedtest/core` and `@comet-speedtest/config`.
- Published distribution Modules: `@comet-speedtest/production` and
  `@comet-speedtest/create-app`.
- Repository-owned app implementation: the Production app in `apps/production`
  and private UI in `internal/ui`.

## Published Libraries

`@comet-speedtest/core` is the publishable speed-test Module. Its root Interface
covers a Speed test run, result records, plans, quality scoring, and grading.
Diagnostics and test-only seams stay on explicit subpaths so specialized
Adapters do not become part of the default production Interface by accident.

`@comet-speedtest/config` is the publishable Runtime config Module. It owns schema,
defaults, validation, normalization, and export helpers for apps and library
callers.

These are the library packages intended for custom speed test clients.

## Published Distribution Modules

`@comet-speedtest/production` is the deployable Production app Module. Its
Interface is the `comet-speedtest` command set plus the `public/` runtime files a
generated deployment owns. It does not export React components, UI primitives, or
hooks.

`@comet-speedtest/create-app` is the Create command Module. It creates three
project shapes: a Deployable configured app, a Source app, or a minimal
core-library example. It assembles generated project files from canonical repo
source during package build instead of maintaining a duplicate template source
tree.

## Private Workspace Modules

The workspace root remains private and exists for repository coordination,
scripts, and dependency catalogs.

`@comet-speedtest/internal-ui` remains private/internal. It is an app-facing React
UI Module used by the Production app and Playground, not a public package with a
stable npm Interface. Source app generation copies its implementation into
`src/comet-ui`, after which the generated project owns that source.

`apps/production` remains private. The Production app is canonical first-party
source that builds the bundled static app shipped by
`@comet-speedtest/production`.

`apps/playground` remains private. The Playground is the engineering console for
tuning Runtime config, endpoints, theme, sampling, latency, throughput, and
diagnostics.
