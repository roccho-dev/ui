# Purpose adapter PR-1: real fixture artifact

## Goal
Make the purpose adapter artifact prove the real Purpose Atlas SDUI fixture, not a small handwritten placeholder document.

## Primary gap
The current artifact builder can produce a purpose artifact without reading the real Purpose Atlas surface fixture. That proves only a thin A2UI connection, not the expected UI route.

## Scope
- Replace the purpose-only placeholder document path in `packages/a2ui-adapter-artifacts/scripts/build.mjs`.
- Read `tests/fixtures/purpose-atlas/surface.v0.9.jsonl` as the purpose source surface.
- Preserve the thin adapter boundary: no domain state store inside `ui.git`.
- Generate a preview that is useful for visual confirmation, not only a JSON model page.
- Make the proof report include real source digests and boundary checks.

## Non-scope
- Do not add gap/work-order/receipt UI yet.
- Do not change GitHub PR creation behavior.
- Do not turn UI artifacts into authority.

## Acceptance
- The purpose artifact surface is derived from the real fixture surface.
- The preview confirms the actual SDUI document path.
- The proof fails if the source surface is missing.
- The proof fails if an action outside the purpose requirement allowlist appears.
- The proof fails if a port other than `atlasStage` appears.
- The proof report contains source digest, generated digest, checked actions, checked ports, and status.

## Implementation closure
- `build.mjs` now reads `tests/fixtures/purpose-atlas/surface.v0.9.jsonl` for the purpose artifact.
- The generated purpose surface JSONL is derived from that fixture, and the fixture is copied into the artifact source folder.
- The preview is rendered as an HTML surface preview with the SDUI tree and proof chips, not a JSON-only page.
- The proof report includes source digest, generated surface digest, generated data-model digest, checked actions, checked ports, checked paths, and pass status.
- The proof path validates the requirement contract and rejects actions, ports, or paths outside the allowlist.
- Purpose negative controls intentionally inject a bad action and a bad port to ensure the proof fails when the validator is weakened.

## Dependency
None. This must land before schema or UI expansion.
