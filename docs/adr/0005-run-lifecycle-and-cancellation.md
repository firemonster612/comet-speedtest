# ADR 0005: Run Lifecycle And Cancellation

## Status

Accepted

## Context

Changing config while a speed test run was active could replace the UI engine reference before cleanup ran. Target selection also composed caller abort and timeouts inconsistently.

## Decision

A speed test run is owned by the engine that started it. UI cleanup stops that active engine and stale subscriptions check run ownership before updating state.

Inside the engine, the abort controller and state belong to the run that created them. A finishing run settles before it publishes: it releases the controller and writes its terminal state, then emits `result` or `error`. A listener for those events may start the next run, so the finished run writes nothing after publishing. Cancellation is checked at every phase boundary and again before success is published, so a stop from any earlier listener ends the run as aborted.

Every event is dispatched the way DOM `EventTarget` dispatches: a listener that throws is reported as an uncaught error, the remaining listeners still run, and the run's measurements and outcome are unaffected. A consumer bug therefore cannot fail a run, trigger the upload transport fallback, or be remembered as a transport failure. A listener ends a run only by calling `stop()`.

Each throughput phase attempt emits through a sink that closes when the attempt settles, and a stopped worker pool detaches its message handlers, so a message a stopped worker had already queued never reaches listeners after `phase-complete` or `phase-reset`.

Target selection composes caller abort signals and per-probe timeouts in one internal module. Production passes its config-load abort signal through target selection.

## Consequences

Config changes stop the old run instead of the new idle engine. Caller abort and timeout behavior is local to one target-selection module and can be tested through the public selection interface.
