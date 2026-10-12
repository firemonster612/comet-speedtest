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

The command can create:

- a deployable configured app with no source code exposed.
- a source app based on the Comet UI, with the UI copied into the project.
- a minimal core-library example for building a custom client.

## Options

In an interactive terminal the command prompts for anything a flag does not
set. Otherwise it uses the defaults below, and the project name is required.
Run `create-comet-speedtest-app --help` for the same reference.

| Flag                               | Effect                                                                | Default                                              |
| ---------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| `--deploy`, `--deployable`         | Deployable configured app                                             | Yes                                                  |
| `--source`                         | Source app with the Comet UI copied into `src/`                       |                                                      |
| `--core`                           | Minimal custom app using the core library                             |                                                      |
| `--pm`, `--package-manager <name>` | `pnpm`, `npm`, `yarn`, or `bun` for the generated project             | The package manager running the command, else `pnpm` |
| `--nginx`                          | Same-origin NGINX endpoints, with the NGINX example in `deploy/nginx` | Off: endpoint URLs are placeholders                  |
| `--no-nginx`                       | Skip the NGINX example files                                          |                                                      |
| `--install`, `--no-install`        | Install dependencies                                                  | `--install`                                          |
| `--git`, `--no-git`                | Initialize a git repository                                           | `--git`                                              |
| `-h`, `--help`                     | Show usage                                                            |                                                      |

A scripted run:

```sh
pnpm create @comet-speedtest/app my-speedtest --deploy --nginx --pm pnpm --no-git
```

With `npm create`, put `--` before the flags so npm passes them through:

```sh
npm create @comet-speedtest/app@latest my-speedtest -- --deploy --no-git
```

## Speed test endpoints

Every generated project reads its download, upload, and latency URLs from
`public/comet.config.json`, and each one needs a real server behind it. The
generated `dev` and `preview` servers only serve the app, and `check` and
`build` never contact the endpoints. Unless you pass `--nginx` or enter your
own URLs, the config holds placeholder same-origin paths. The generated
README lists the next steps and links the
[endpoint contract](https://github.com/firemonster612/comet-speedtest/blob/main/docs/library/config.md#targets)
and the
[NGINX example](https://github.com/firemonster612/comet-speedtest/tree/main/examples/nginx).

Generated source projects use `oxfmt` and `oxlint` regardless of package
manager.
