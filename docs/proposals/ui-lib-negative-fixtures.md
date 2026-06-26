# ui-lib negative fixtures proposal

## Why

ui-lib boundaries must be enforced by failing examples, not only prose.

## Direction

Add negative fixtures for the Markdown renderer library path.

## Decision

ui-lib tests should cover raw ADR reads, policy validation attempts, HTML output, artifact upload, authority fields in the document model, nondeterministic output, unknown block silent drop, and unsafe content acceptance.

## Boundary

These fixtures enforce renderer boundaries. They do not implement gov-lib projection or repo artifact CI.

## Merge Gate

All listed negative fixtures must fail for the intended reason before renderer implementation is considered complete.