# ADR 0003: Worker Adapter Strategy

## Status

Accepted

## Context

The engine can run real browser worker transports or deterministic test adapters. Exporting synthetic adapters from the root core interface made the test seam look like a production interface.

## Decision

Worker and measurement adapters remain internal to the engine implementation. Deterministic and synthetic adapters are exported only from `@comet-speedtest/core/testing`.

## Consequences

The production interface stays focused on running a speed test. Tests retain a stable seam for deterministic phases without making adapter details part of the main package contract.
