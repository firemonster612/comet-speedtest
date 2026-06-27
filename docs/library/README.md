# Library Docs

Lightspeed has two public library packages:

- `@lightspeed/config` for runtime config.
- `@lightspeed/core` for speed-test runs and results.

Start with config if your app reads JSON from a deployment file. Start with core
if your app already has a config object and needs to run a test.

## Docs

- `core.md`: creating a speed test, listening for events, reading outcomes, and
  using diagnostics or test helpers.
- `config.md`: config shape, validation, normalization, target profiles, and
  loading `/lightspeed.config.json`.

The production app in `apps/production` is the reference app for using both
packages together.
