# Contributing

Thanks for taking the time to work on Comet.

Comet has two jobs: a browser speed-test library for teams building their
own client, and a production app for teams that want a deployable branded page.
Changes should keep those two jobs separate. The public library Interface should
stay small; diagnostics and test-only helpers belong on explicit subpaths.

## Setup

Use Node 22 (the version CI runs) and pnpm 11.8.0, which `packageManager` in
`package.json` pins. Do not use npm for this repo.

```sh
pnpm install
pnpm exec playwright install --with-deps chromium firefox
```

The second command installs the browsers `pnpm check` runs the browser tests in.
Without it, the browser tests fail with a missing-executable error.

## Local Development

```sh
pnpm dev             # playground (prod app but with dev tools sidebar for debugging)
pnpm dev:prod        # production app
pnpm build          # bundle all the packages into their respective `dist` folders
pnpm test:packages  # pack the publishable packages and build a project from each create-app mode
pnpm check          # run formatter check, lint, typecheck, unit tests, build, browser tests and pnpm test:packages
```

Vite and Vitest read workspace source through `workspace-vite-aliases.ts`.

## Pull Requests

Before opening a pull request:

- Keep the change focused.
- Add or update tests when behavior changes.
- Update docs when public behavior, config, or deployment steps change.
- Run `pnpm check`.

For public Interface changes, explain the compatibility impact. If a change
makes callers learn more about internals, it probably belongs behind a narrower
Module or subpath.

## Architecture Notes

The current architectural decisions live in `docs/adr/`. Read the ADRs before
changing core package exports, runtime config behavior, worker adapters, or local
source-vs-dist wiring.

The project vocabulary in `CONTEXT.md` is meant to stay current. If you add a
new domain term, add it there too.
