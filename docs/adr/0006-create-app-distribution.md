# ADR 0006: Create App Distribution

## Status

Accepted

## Context

The Production app is intended to be deployable, but users should not have to
clone the monorepo and copy files by hand. Publishing the first-party UI as a
normal npm package would expose a React/Tailwind/shadcn-oriented Interface that
is easy to misuse as an embeddable widget contract.

## Decision

Keep first-party UI in private `@comet-speedtest/internal-ui`.

Publish `@comet-speedtest/production` as the deployable app Module. Its Interface
is the `comet-speedtest` command set and project-owned `public/` files, not React
components.

Publish `@comet-speedtest/create-app` as the Create command Module. It creates:

- a Deployable configured app that depends on `@comet-speedtest/production`.
- a Source app that copies the Production app and internal UI implementation into
  a standalone Vite app.
- a minimal core-library example for callers building their own UI.

Generated source app artifacts are assembled during package build from
`apps/production` and `internal/ui`. The repo does not maintain a second template
source tree.

## Consequences

Deployers get a small config-and-assets project. Source customizers get editable
UI source that they own after creation. Library builders continue to depend on
`@comet-speedtest/core` and `@comet-speedtest/config`.

The private UI Module keeps locality for first-party apps without becoming a
public npm Interface. Source app users do not receive automatic UI updates;
updating copied UI source is their responsibility.
