# Lightspeed

Lightspeed is a browser-first speed test toolkit. The core package owns
measurement. The UI package owns reusable React views. The production app is a
static deployable page. The playground is the engineering console for endpoint
tuning and diagnostics.

## Release Scope

The current npm release scope is limited to the publishable library packages:
`@lightspeed/core` and `@lightspeed/config`.

The workspace root, `@lightspeed/ui`, `apps/production`, and `apps/playground`
remain private. The production app ships from this GitHub repository as
deployable source/template for teams that want a branded page, not as an npm
package. The playground remains an internal engineering console.

## Project Files

- License: MIT. See `LICENSE`.
- Contributing: see `CONTRIBUTING.md`.
- Security reports: see `SECURITY.md`.
- Release notes: see `CHANGELOG.md`.
- Library docs: see `docs/library/`.

## Workspace

- `packages/config` (published library): runtime config schema, defaults,
  validation, normalization, and export helpers.
- `packages/core` (published library): measurement engine, transport resolution,
  sampling math, latency aggregation, worker protocol, and diagnostics.
- `packages/ui` (private internal design system, not published): source-owned
  React UI primitives, controller hook, widget, result display, charts, errors,
  and diagnostics.
- `apps/production` (private deployable source/template): static
  customer-facing app that loads `/lightspeed.config.json`.
- `apps/playground` (private): config editor and diagnostics console. Supports
  `?config=/path/to/profile.json`.
- `examples/nginx`: endpoint and static hosting examples.

## Commands

```sh
pnpm install
pnpm check
pnpm build
pnpm dev            # playground (the default engineering console)
pnpm dev:prod       # the static customer-facing app
```

The production app and playground both consume the public package interfaces.
No app imports core internals or worker files directly.
Vite and Vitest use workspace source aliases for local development and tests, so
fresh source edits are visible without a package build. Package exports still
point at compiled `dist` for publish-time consumption.

## Selective Runs

`@lightspeed/core` can run the full test or a selected subset:

```ts
const engine = createSpeedTest(config);

await engine.run({ selection: { phases: ["download"] } });
await engine.run({
  selection: { phases: ["upload"], loadedLatency: false },
});
```

Runtime JSON can set the same default under `test.selection`. Skipped result
buckets are `null`, so custom renderers should check `result.download`,
`result.upload`, and each latency bucket before displaying them.
