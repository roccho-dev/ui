# Proposal addendum: Nix CI for A2UI Shell + Data Cartridge boundary

## Purpose generations

| Generation | Purpose |
|---:|---|
| G0 | Prove the proposal with an executable CI check |
| G1 | Keep the check limited to design invariants only |
| G2 | Verify the same boundary through `npm test` and `nix flake check` |
| G3 | Fail when A2UI shell and data cartridge are mixed |
| G4 | Fail when data carries raw HTML or authority fields |
| G5 | Prove data changes do not change shell digest |
| G6 | Make local and CI verification reproducible |
| G7 | Keep generated HTML and per-conversation JSONL out of source |
| G8 | Make the proposal reviewable before implementation work |
| G9 | Preserve business transfer readiness through deterministic checks |

## Decision

Add an architecture-only test and Nix check to this proposal PR.

This is not the final shell compiler implementation. It is a guard that proves the proposal's non-negotiable invariants remain mechanically checkable.

## Scope

This addendum adds:

- `tests/check-a2ui-shell-data-boundary.mjs`
- an import from `tests/run-all.mjs`
- `checks.<system>.a2ui-shell-data-design-invariants` in `flake.nix`
- `.github/workflows/nix-flake-check.yml`

## Invariants checked

- shell contains `createSurface` and `updateComponents`
- shell rejects `updateDataModel`
- data cartridge contains only `updateDataModel`
- root `/` updates are rejected
- undeclared data paths are rejected
- raw HTML in data is rejected
- authority fields such as `mergeReady` are rejected
- shell digest is stable across data changes
- data digest changes when data changes
- preview digest changes when data changes
- generated artifacts remain non-authority

## Boundary

The CI verifies only the design boundary. It does not prove final Purpose Atlas visual parity, browser behavior, product value, or ADR acceptance.

## Merge gate

The proposal should not be considered mechanically supported until:

```sh
nix flake check --print-build-logs
```

passes on GitHub Actions for this PR head.
