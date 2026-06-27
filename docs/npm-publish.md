# npm Publish Runbook

This repo publishes two packages:

- `@lightspeed/config`
- `@lightspeed/core`

Publish `@lightspeed/config` first. `@lightspeed/core` depends on it.

## Before Publishing

Run these checks from the workspace root:

```sh
pnpm check
pnpm --filter @lightspeed/config pack --dry-run
pnpm --filter @lightspeed/core pack --dry-run
pnpm --filter @lightspeed/config publish --dry-run
pnpm --filter @lightspeed/core publish --dry-run
```

Also confirm that you are logged in to npm and that your npm account can publish
to the `@lightspeed` scope:

```sh
pnpm whoami --registry https://registry.npmjs.org/
```

Commit or stash local changes before the real publish. pnpm blocks publish from
a dirty Git tree by default, including dry-runs that do not pass
`--no-git-checks`.

The scoped packages use `publishConfig.access = "public"`, so the first real
publish should create public packages instead of private scoped packages.

Once the public GitHub URL exists, add `repository`, `homepage`, and `bugs`
fields to the two publishable package manifests before publishing.

## Actual Publish

Do not run these commands until the release is approved:

```sh
pnpm --filter @lightspeed/config publish
pnpm --filter @lightspeed/core publish
```

After publishing, install both packages in a clean project and verify the same
imports used in `docs/npm-smoke/consumer.ts`.
