# ADR 0001: Public Core Interface

## Status

Accepted

## Context

The root `@lightspeed/core` interface exported the concrete engine class, synthetic adapters, transport resolution, latency helpers, and sampling helpers. That made internal seams look as stable as the speed test result interface.

## Decision

The root `@lightspeed/core` interface exposes `createSpeedTest`, speed-test/result types, result records, plans, quality scoring, and bufferbloat grading. Diagnostics helpers move to `@lightspeed/core/diagnostics`. Test adapters move to `@lightspeed/core/testing`.

## Consequences

Production code depends on the smaller speed-test/result interface. Tests and diagnostic tools can still use lower-level modules, but their imports make that dependency explicit. Future breaking-change review treats `.` as the stable interface and subpaths as narrower contracts.
