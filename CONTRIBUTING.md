# Contributing

Thanks for taking the time to work on Comet.

Comet has two jobs: a browser speed-test library for teams building their
own client, and a production app for teams that want a deployable branded page.
Changes should keep those two jobs separate. The public library Interface should
stay small; diagnostics and test-only helpers belong on explicit subpaths.

## Setup

Use pnpm. Do not use npm for this repo.

```sh
pnpm install
pnpm check
```

`pnpm check` runs formatting, linting, type checks, unit tests, builds, and
browser tests. Please run it before you call a change done.

## Local Development

```sh
pnpm dev             # playground
pnpm dev:prod        # production app
pnpm build
```

Vite and Vitest read workspace source through `workspace-vite-aliases.ts`.
Published package entry points still point at `dist`.

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

## Security

Do not report security problems in public issues. Follow `SECURITY.md`.
