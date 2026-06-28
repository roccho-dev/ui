# Purpose adapter PR-3: closure UI projection

## Goal
Render the purpose closure projection as a control plane inside the Purpose Atlas SDUI route.

## Primary gap
The purpose surface can show a map and selected-node detail. It still needs the loop objects that make purpose closure inspectable.

## Scope
- Extend the purpose fixture data with closure projection rows.
- Show route, gap, finding, task, work order, dependency, receipt, and residual as separate concepts.
- Keep the detail panel selection-gated.
- Keep layout and CSS in SDUI surface JSONL.
- Keep heavy rendering behind `atlasStage`.

## Non-scope
- No external runtime polling.
- No source-of-truth role for UI.

## Acceptance
- Selected gap shows ideal, current, delta, owner role, and proof requirement.
- Selected work order shows scope, non-scope, route, dependency, and closure criteria.
- Receipt status distinguishes closed, reduced, and residual.
- Residual gap is visible as next projection input.
- Header and explanation are controlled by surface-level data.

## Dependency
PR-2 first.
