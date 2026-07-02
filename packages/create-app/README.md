# @comet-speedtest/create-app

Create a Comet speed test project:

```sh
pnpm create @comet-speedtest/app my-speedtest
```

You can also run the create command with another package manager:

```sh
npm create @comet-speedtest/app@latest my-speedtest
yarn create @comet-speedtest/app my-speedtest
bun create @comet-speedtest/app my-speedtest
```

Generated projects can use `pnpm`, `npm`, `yarn`, or `bun`. Pass the choice
directly for scripted usage:

```sh
pnpm create @comet-speedtest/app my-speedtest --package-manager npm
```

The command can create:

- a deployable configured app with no source code exposed.
- a source app based on the Comet UI, with the UI copied into the project.
- a minimal core-library example for building a custom client.

Generated source projects use `oxfmt` and `oxlint` regardless of package
manager.
