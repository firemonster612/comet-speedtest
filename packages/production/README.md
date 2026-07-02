# @comet-speedtest/production

CLI commands and the bundled static production app used by projects created with
`pnpm create @comet-speedtest/app`.

The package exposes commands, not React components:

```sh
comet-speedtest dev
comet-speedtest check
comet-speedtest build
comet-speedtest preview
```

Projects provide runtime files in `public/`, especially
`public/comet.config.json`. `comet-speedtest build` copies the bundled app and
the project `public/` directory into `dist/`.
