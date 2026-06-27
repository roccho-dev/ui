# ui

`ui` owns the A2UI / SDUI component registry and renderer-neutral projection package.

## Current layout

| Responsibility | Path |
|---|---|
| Core package | `packages/core-port/src/**` |
| Purpose Atlas preview package | `packages/purpose-atlas-preview/**` |
| Purpose Atlas fixture input | `tests/fixtures/purpose-atlas/**` |
| Purpose Atlas source reference | `tests/reference/purpose-atlas-source/**` |
| Generated preview/evidence | Nix and CI outputs |

## Boundary

Purpose Decision Atlas v6 uses `core+port as lib`.
Runtime input is expected to be `ADRS projected input` produced outside this repo.
A2UI is `a2ui as build`.
JSONL in this repo is `jsonl as attached data`.
Fixtures must be `stateless` and `non-authoritative`.
`ui.git is not a state store`.

Generated preview HTML, dist assets, evidence receipts, and manifests are build evidence only and are not tracked as repository authority.
