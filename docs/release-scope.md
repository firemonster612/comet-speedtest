# Release Scope

Lightspeed currently has two release tracks:

- Published library Modules: `@lightspeed/core` and `@lightspeed/config`.
- Repository-shipped app source: the Production app in `apps/production`.

## Published Libraries

`@lightspeed/core` is the publishable speed-test Module. Its root Interface
covers a Speed test run, result records, plans, quality scoring, and grading.
Diagnostics and test-only seams stay on explicit subpaths so specialized
Adapters do not become part of the default production Interface by accident.

`@lightspeed/config` is the publishable Runtime config Module. It owns schema,
defaults, validation, normalization, and export helpers for apps and library
callers.

These are the only packages intended for npm publication in the current release
scope.

## Private Workspace Modules

The workspace root remains private and exists for repository coordination,
scripts, and dependency catalogs.

`@lightspeed/ui` remains private/internal for now. It is an app-facing React UI
Module used by the Production app and Playground, not a public package with a
stable npm Interface.

`apps/production` remains private. The Production app is included in GitHub as
deployable source/template for teams that want a branded page, rather than as an
npm package.

`apps/playground` remains private. The Playground is the engineering console for
tuning Runtime config, endpoints, theme, sampling, latency, throughput, and
diagnostics.
