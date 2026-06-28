# Purpose adapter PR-2: closure projection schema

## Goal
Define the smallest checked data contract for the purpose closure control plane.

## Primary gap
Purpose route, gap, finding, work order, dependency, receipt, and residual need one shared projection shape. Without this, the UI can show a map but cannot prove the purpose loop.

## Scope
- Add a purpose closure projection fixture.
- Add checks for projection rows.
- Keep generated projections non-authoritative.
- Separate finding, gap candidate, gap, task, work order, receipt, and residual.

## Minimal rows
- `purpose_node`
- `route_edge`
- `finding_node`
- `gap_node`
- `subgap_node`
- `task_node`
- `work_order`
- `dependency_edge`
- `receipt_node`
- `residual_gap`

## Non-scope
- Do not redesign Purpose Atlas visuals.
- Do not create runtime state storage.
- Do not make UI authoritative.

## Acceptance
- One loop fixture is valid: purpose route -> gap -> work order -> receipt -> residual.
- Finding without owner, proof, and route stays finding.
- Work order requires `primary_gap_id`.
- Receipt separates closed, reduced, and residual.
- Projection rows are generated and non-authoritative.

## Implementation closure
- `tests/fixtures/purpose-closure/one-loop.valid.jsonl` now carries the checked one-loop projection fixture.
- `tests/check-purpose-closure-projection.mjs` validates the projection row types, required references, non-authoritative marker, finding promotion boundary, work order `primary_gap_id`, receipt status separation, and residual return path.
- Invalid fixtures prove the gate goes red for a missing work order `primary_gap_id`, a receipt that omits residual handling, and a finding bound to a gap before owner/proof/route are present.
- `tests/run-all.mjs` runs the closure projection check in the existing Nix-facing check path.

## Dependency
PR-1 first.
