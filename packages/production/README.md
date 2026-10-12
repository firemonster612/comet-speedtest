# @comet-speedtest/production

CLI commands and the bundled static production app used by projects created with
`pnpm create @comet-speedtest/app`.

The package exposes commands, not React components:

| Command                   | Effect                                                        |
| ------------------------- | ------------------------------------------------------------- |
| `comet-speedtest dev`     | Serve the bundled app with the project `public/` files on top |
| `comet-speedtest check`   | Validate the structure of `public/comet.config.json`          |
| `comet-speedtest build`   | Run `check`, then copy the app and `public/` into `dist/`     |
| `comet-speedtest preview` | Serve `dist/`                                                 |
| `comet-speedtest --help`  | Show usage (also `-h` or `help`)                              |

| Option          | Effect                   | Default           |
| --------------- | ------------------------ | ----------------- |
| `--host <host>` | Host for `dev`/`preview` | `0.0.0.0`         |
| `--port <port>` | Port for `dev`/`preview` | `4173`            |
| `--root <path>` | Project root             | Current directory |

Projects provide runtime files in `public/`, especially
`public/comet.config.json`.

`dev` and `preview` serve static files only. The speed test endpoints named in
`comet.config.json` need their own server, and `check` validates the config
structure without contacting them. See the
[endpoint contract](https://github.com/firemonster612/comet-speedtest/blob/main/docs/library/config.md#targets).
