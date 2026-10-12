# Changelog

## 0.2.0 - 2026-10-12

This release fixes measurement accuracy, run lifecycle and config bugs found in a
codebase audit, and several developer-experience problems. It contains breaking
changes; see "Changed".

### Changed

- `DeterministicPhaseAdapter` (from `@comet-speedtest/core/testing`) now requires a
  `runIdleLatency` method. Custom adapters must add it.
- A listener that throws no longer fails the run. Every event is dispatched like
  DOM `EventTarget`: the exception is reported as uncaught and the other listeners
  still run. Call `stop()` to end a run from a listener.
- Errors outside a measured phase use the new `internal-error` code instead of
  `upload-failed` or `download-failed`, and `SpeedTestEvent` gains `phase-reset`.
  Both widen public unions, so an exhaustive `switch` over error codes or event
  types needs a new case. A live display that collects `sample`, `window` or
  `latency-sample` events should drop that phase's data on `phase-reset`.
- With a `measurementAdapter`, `createTestSpeedTest` now reports every transport
  as supported unless you pass `capabilities`; 0.1.0 detected them.
- `createSpeedTest` and `createTestSpeedTest` no longer swap in the synthetic
  adapter when `NODE_ENV` is `test`; pass `measurementAdapter` explicitly.
- A throughput phase that ends before any measured window now fails instead of
  reporting 0 bps.
- Quality scores for an activity are `unknown` when any of its inputs is missing.
- `createResultRecord(..., { rawSamples: "strip" })` also strips latency samples.
- `validateConfig` rejects URLs that can't be resolved against the base URL
  (pass `{ baseUrl }`), theme fields of the wrong type, and profile `metadata`
  that isn't plain JSON data.

### Added

- `phase-reset` event, emitted before the engine retries upload on `xhr-chunked`.
- With `SyntheticMeasurementAdapter`, `createTestSpeedTest` runs without network
  calls or Workers and gives identical measurements for identical config (only
  `runId` and the timestamps differ). Without an adapter it detects capabilities
  and measures over the network as before. `@comet-speedtest/core/testing` also
  exports `IdleLatencyOptions`, `PhaseOptions` and `PhaseEventSink` for adapter
  authors.
- `--help` / `-h` for `create-comet-speedtest-app` and `comet-speedtest`.
- Generated projects explain that the endpoints need a real server and mark
  placeholder URLs.
- The packages ship their sources, so declaration maps resolve.

### Fixed

- Upload streaming is detected correctly, so Firefox and Safari use XHR upload.
- Fetch-stream upload counts a chunk only after fetch takes it.
- Window throughput is total bytes over total duration, not a mean of per-sample
  rates.
- `maxDurationMs` can no longer hide a phase where every worker failed.
- GET latency and reachability probes cancel their response bodies, and abort
  listeners no longer leak.
- A run started from a `result` or `error` listener can be stopped, and stopping
  from the last `phase-complete` listener ends the run as aborted.
- Messages from a failed upload attempt no longer arrive after the fallback, and
  the fallback is remembered only after the retry succeeds.
- Quality scoring reads loaded latency without requiring the idle phase.
- The React controller stops the run on unmount, ignores events from superseded
  runs, and no longer gets stuck at "running" under StrictMode or `<Activity>`.
- The production app ties result submissions to their run, times them out after
  15 seconds, and clears them when a new run starts.
- `normalizeConfig` no longer freezes the caller's `metadata` or throws a bare
  `TypeError` for a bad URL, and `loadRuntimeConfig` wraps network failures in
  `RuntimeConfigError`.
- `pnpm pack` builds the packages before packing and fails if an entry point is
  missing.

## 0.1.0 - 2026-06-30

### Added

- Initial `@comet-speedtest/core` package for browser speed-test runs, result
  records, plans, quality scoring, diagnostics, and test helpers.
- Initial `@comet-speedtest/config` package for runtime config defaults, validation,
  normalization, loading, and export helpers.
- Production app source for deployments that load `/comet.config.json`.
- Playground source for tuning runtime config and endpoint behavior.
- Open-source project files: MIT license, contribution guide, security policy,
  issue templates, and pull request template.
