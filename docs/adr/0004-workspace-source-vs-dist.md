# ADR 0004: Workspace Source vs Dist Consumption

## Status

Accepted

## Context

Package exports point at `dist`, which is correct for publish-time consumption but made local Vite apps and Vitest runs sensitive to stale build output.

## Decision

Keep package exports pointed at `dist`. Add a deliberate workspace source adapter for Vite and Vitest through `workspace-vite-aliases.ts`, used by apps and package test configs.

## Consequences

Fresh local dev and tests consume source changes directly. Published packages and TypeScript project builds still validate the `dist`-based package interface.
