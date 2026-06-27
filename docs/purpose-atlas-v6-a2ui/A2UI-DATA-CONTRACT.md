# Purpose Atlas A2UI data contract

- inputAuthority: external to ui.git
- primary input: `ADRS projected input`
- preview package: `packages/purpose-atlas-preview/**`
- shell fixture: `tests/fixtures/purpose-atlas/surface.v0.9.jsonl`
- attached data fixture: `tests/fixtures/purpose-atlas/atlas-data.json`
- source reference: `tests/reference/purpose-atlas-source/**`
- generated outputs: Nix and CI artifacts only

The attached fixture data is replaceable by ADRS projected input.

Purpose Decision Atlas v6 uses `core+port as lib`.
A2UI is `a2ui as build`.
JSONL in this repo is `jsonl as attached data`.
Fixtures must be `stateless` and `non-authoritative`.
`ui.git is not a state store`.

runtime behavior only: mismatch recording, request owner, hold decision, replay state, selection, zoom, playback, and in-memory UI interactions do not approve or store canonical ADR/domain decisions.
