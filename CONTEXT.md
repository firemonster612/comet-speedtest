# Comet Context

Comet is a browser-first speed test toolkit with two deliverables: a core library for teams building their own speed test client, and a production app for teams that want a deployable branded page.

## Domain Vocabulary

- **Speed test run**: one user-initiated measurement from start through completion, failure, or abort. A run owns its engine instance, subscriptions, abort controller, samples, partial result, and final result.
- **Runtime config**: JSON-compatible deployment input loaded by apps or provided by library callers. It covers brand, theme, content, targets, target profiles, target selection, test knobs, and result submission.
- **Target profile**: a named set of download, upload, and optional latency endpoints. Production can choose a profile before the speed test run begins.
- **Measurement phase**: one selected part of a speed test run: idle latency, download, upload, or finalize. Download and upload phases may also collect loaded latency.
- **Transport**: the browser mechanism used for a throughput phase, such as fetch response streaming, fetch upload streaming, or XHR upload progress.
- **Result record**: the portable result payload created from a completed speed test result for storage or submission. It may preserve or strip raw samples.
- **Production app**: the deployable customer-facing app that loads `/comet.config.json`, selects a target profile when configured, runs the widget, and optionally submits a result record.
- **Create command**: the project generator that creates a deployable configured app, a source app based on the Comet UI, or a minimal core-library example without requiring users to clone the monorepo.
- **Deployable configured app**: a small generated project that owns `public/comet.config.json` and brand assets while delegating app serving and builds to `@comet-speedtest/production`.
- **Source app**: a generated standalone Vite app that receives a copied, local `src/comet-ui` implementation based on the first-party UI. The user owns that source after creation.
- **Playground**: the engineering console for tuning runtime config, endpoints, theme, sampling, latency, throughput, and diagnostics.

## Architectural Vocabulary

- The core package exposes a small public speed-test/result interface at `@comet-speedtest/core`.
- Diagnostic and test-only seams live on explicit subpaths so production callers do not learn internal transport, sampling, or synthetic adapter details by accident.
- Runtime config compatibility is strict for malformed known sections and lenient for unknown fields unless strict mode is requested.
- Workspace apps and tests consume source through Vite/Vitest aliases; published package interfaces continue to point at `dist`.
- First-party UI lives in an internal private module. It is never a public npm interface; it is either bundled behind the production app commands or copied into a source app.
