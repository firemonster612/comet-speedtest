# npm Publish Runbook

This repo publishes four packages:

- `@comet-speedtest/config`
- `@comet-speedtest/core`
- `@comet-speedtest/production`
- `@comet-speedtest/create-app`

Publish `@comet-speedtest/config` first. `@comet-speedtest/core` depends on it.
Publish the distribution packages after the libraries so generated projects can
install the versions they reference.

## Before Publishing

Run these checks from the workspace root:

```sh
pnpm check
pnpm --filter @comet-speedtest/config pack --dry-run
pnpm --filter @comet-speedtest/core pack --dry-run
pnpm --filter @comet-speedtest/production pack --dry-run
pnpm --filter @comet-speedtest/create-app pack --dry-run
pnpm --filter @comet-speedtest/config publish --dry-run
pnpm --filter @comet-speedtest/core publish --dry-run
pnpm --filter @comet-speedtest/production publish --dry-run
pnpm --filter @comet-speedtest/create-app publish --dry-run
```

`pnpm check` ends with `pnpm test:packages`, the packed-package smoke test in
`scripts/test-packages.mjs`. It checks what users install rather than the
workspace source:

1. Builds config and core, then runs `pnpm pack` for all four packages into a
   temp directory. The production and create-app `prepack` scripts rebuild the
   bundled app and templates.
2. Installs the config and core tarballs into a consumer project and
   type-checks `docs/npm-smoke/consumer.ts` with `NodeNext` resolution and
   `skipLibCheck` off, then imports every `exports` entry in Node.
3. Runs the packed `create-comet-speedtest-app` binary in `--deploy --nginx`,
   `--source` and `--core` modes.
4. Installs each generated project and runs its `check` script. Source and core
   `check` ends with a build. The deployable project also runs `build`; both
   its scripts use the packed `comet-speedtest` CLI.

Every project gets a `pnpm-workspace.yaml` that overrides each
`@comet-speedtest/*` package with its tarball, so nothing from the scope comes
from the registry. Third-party packages install with `--prefer-offline`, so a
warm pnpm store needs no network. The script deletes its temp directory and
exits non-zero with the failing command when a step fails. Run it on its own
with:

```sh
pnpm test:packages
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
pnpm --filter @comet-speedtest/production publish
pnpm --filter @comet-speedtest/create-app publish
```

After publishing, install both packages in a clean project and verify the same
imports used in `docs/npm-smoke/consumer.ts`. Also verify:

```sh
pnpm create @comet-speedtest/app comet-deploy-smoke -- --deploy --install --no-git
cd comet-deploy-smoke
pnpm check
pnpm build
cd ..
pnpm create @comet-speedtest/app comet-source-smoke -- --source --no-install --no-git
```
