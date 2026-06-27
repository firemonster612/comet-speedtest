# ADR 0002: Runtime Config Compatibility

## Status

Accepted

## Context

Runtime config is deployment input. Unknown fields should not break a production app by default, but malformed known sections should not silently normalize to defaults because that hides operator mistakes.

## Decision

Validation rejects malformed known object sections and malformed known field types. Unknown fields remain warnings in normal mode and become errors only when strict validation is requested.

Known simple sections derive their field lists from `schema.ts`. The `test` section continues to derive ranges, types, labels, and editor metadata from the same schema module.

## Consequences

Deployments remain forward-compatible with extra fields, while bad `brand`, `content`, `test`, and `result` shapes fail before normalization. Adding a runtime config field should update the schema module first, then normalization and editor surfaces read from that module.
