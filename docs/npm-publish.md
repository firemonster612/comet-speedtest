# npm Publish Runbook

This repo publishes two packages:

- `@comet-speedtest/config`
- `@comet-speedtest/core`

Publish `@comet-speedtest/config` first. `@comet-speedtest/core` depends on it.

## Before Publishing

Run these checks from the workspace root:

```sh
pnpm check
pnpm --filter @comet-speedtest/config pack --dry-run
pnpm --filter @comet-speedtest/core pack --dry-run
pnpm --filter @comet-speedtest/config publish --dry-run
pnpm --filter @comet-speedtest/core publish --dry-run
```

Also confirm that you are logged in to npm and that your npm account can publish
to the `@comet-speedtest` scope:

```sh
pnpm whoami --registry https://registry.npmjs.org/
```

Commit or stash local changes before the real publish. pnpm blocks publish from
a dirty Git tree by default, including dry-runs that do not pass
`--no-git-checks`.

The scoped packages use `publishConfig.access = "public"`, so the first real
publish should create public packages instead of private scoped packages.

The publishable package manifests already include `repository`, `homepage`, and
`bugs` metadata for `firemonster612/comet-speedtest`.

## Actual Publish

Do not run these commands until the release is approved:

```sh
pnpm --filter @comet-speedtest/config publish
pnpm --filter @comet-speedtest/core publish
```

After publishing, install both packages in a clean project and verify the same
imports used in `docs/npm-smoke/consumer.ts`.
