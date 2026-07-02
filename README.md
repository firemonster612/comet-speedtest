# Comet

The Comet speed test project is split into a core library and an optional production-ready application.

The core library is meant as a building block for YOUR speed test client. It facilitates the implementation of performant throughput testing, latency testing, and formatting for the results of your internet tests.

The production app, on the other hand, is for those who don't want to build their own client. It is simple to deploy and easy to brand. It is meant as an easy solution for those without a specific need for a custom client or those who want to see what the library can do.

## Quick Start

### Production app

Create a deployable Comet project:

```sh
pnpm create @comet-speedtest/app my-speedtest
cd my-speedtest
pnpm dev
```

Choose **Deployable configured app** when you want a branded speed test page
without app source code. The generated project owns `public/comet.config.json`
and brand assets, while `@comet-speedtest/production` provides the
`comet-speedtest` commands:

```sh
pnpm check
pnpm build
pnpm preview
```

Choose **Source app based on the Comet UI** when you like the production UI and
want to own and modify a copied source tree. That mode creates a standalone Vite
app with the UI copied into `src/comet-ui`; it does not depend on a public UI
package.

Deploy the built app as a static site and serve a runtime config file at
`/comet.config.json`. The app loads that config at startup, uses the configured
speed-test endpoints and target profiles, runs the speed test widget, and can
submit a result record when result submission is configured. Also host speed test
endpoints on the same domain (for CORS, unless you have a custom CORS setup)
such as:

- `/speedtest/download/large.bin`
- `/speedtest/upload`
- `/speedtest/latency`

Edit `/comet.config.json` to set the brand, theme, content, speed-test targets, target profiles, target selection, test knobs, and result submission behavior. Branding changes do not require rebuilding the app when they are handled through runtime config. An example config is provided at [apps/production/public/comet.config.json](apps/production/public/comet.config.json)

### Use the library

Install the root packages for config normalization and speed-test execution:

```sh
pnpm add @comet-speedtest/core @comet-speedtest/config   # For pnpm
npm install @comet-speedtest/core @comet-speedtest/config   # For npm
bun add @comet-speedtest/core @comet-speedtest/config   # For bun
```

Very basic library example: Create a normalized config, run a test, and read the result from a successful outcome.

```ts
import { normalizeConfig } from "@comet-speedtest/config";
import { createSpeedTest } from "@comet-speedtest/core";

const config = normalizeConfig({
  targets: {
    download: "https://speed.example.com/download.bin",
    upload: "https://speed.example.com/upload",
    latency: "https://speed.example.com/latency",
  },
});

const speedTest = createSpeedTest(config);
const outcome = await speedTest.run();

if (outcome.ok) {
  console.log(outcome.result);
}
```

## Project Files

- License: MIT. See [LICENSE](LICENSE).
- Contributing: see [CONTRIBUTING.md](CONTRIBUTING.md).
- Release notes: see [CHANGELOG.md](CHANGELOG.md).
- Library docs: see [docs/library/](docs/library/).

## Workspace

- `packages/config` (published library): runtime config schema, defaults,
  validation, normalization, and export helpers.
- `packages/core` (published library): measurement engine, transport resolution,
  sampling math, latency aggregation, worker protocol, and diagnostics.
- `packages/production` (published deployable app commands): the
  `comet-speedtest` CLI and bundled static production app used by deployable
  generated projects.
- `packages/create-app` (published project generator): creates deployable,
  source, or core-library projects without a maintained template source tree.
- `internal/ui` (private internal design system, not published): source-owned
  React UI primitives, controller hook, widget, result display, charts, errors,
  and diagnostics.
- `apps/production` (private deployable source/template): static
  customer-facing app that loads `/comet.config.json`.
- `apps/playground` (private): config editor and diagnostics console. Supports
  `?config=/path/to/profile.json`.
- `examples/nginx`: endpoint and static hosting examples.

## Commands

```sh
pnpm install
pnpm check
pnpm build
pnpm dev            # playground (The prod app with a dev tools sidebar for debugging and dev work.)
pnpm dev:prod       # the static customer-facing app
```
