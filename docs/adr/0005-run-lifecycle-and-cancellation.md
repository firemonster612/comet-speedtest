# ADR 0005: Run Lifecycle And Cancellation

## Status

Accepted

## Context

Changing config while a speed test run was active could replace the UI engine reference before cleanup ran. Target selection also composed caller abort and timeouts inconsistently.

## Decision

A speed test run is owned by the engine that started it. UI cleanup stops that active engine and stale subscriptions check run ownership before updating state.

Target selection composes caller abort signals and per-probe timeouts in one internal module. Production passes its config-load abort signal through target selection.

## Consequences

Config changes stop the old run instead of the new idle engine. Caller abort and timeout behavior is local to one target-selection module and can be tested through the public selection interface.
