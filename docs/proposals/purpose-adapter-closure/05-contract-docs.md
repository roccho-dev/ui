# Purpose adapter PR-5: contract docs

## Goal
Document the purpose adapter as a non-authoritative closure control-plane projection.

## Primary gap
The UI boundary must be clear before the adapter is treated as complete. ADRS and reality receipts remain authoritative. UI artifacts are generated evidence and control surfaces.

## Scope
- Update docs and requirement text for the purpose adapter boundary.
- State that ADRS selects purpose and evidence rules.
- State that UI renders projection only.
- State that work order is an execution contract, not a purpose authority.
- State that receipt and residual return to the reality/projection loop.
- State the consumer responsibility for runtime data and external actions.

## Boundary statements
- ADRS/raw records are the authority for purpose, work order admission, receipt meaning, and residual return path.
- `ui.git` builds non-authoritative artifacts and proof reports from selected inputs.
- The Purpose Atlas preview is a projection surface, not the source of truth.
- A work order is fresh only when its `currentProjectionDigest` matches the generated projection digest.
- A receipt is not closed when it has residuals without `residualHandling`.
- Runtime state, external services, and product actions stay outside this adapter package.

## Inputs and outputs
| Kind | Role |
|---|---|
| `tests/fixtures/purpose-atlas/surface.v0.9.jsonl` | real SDUI fixture source for the purpose artifact |
| `packages/a2ui-adapter-artifacts/requirements/purpose.json` | adapter requirement pack and allowlists |
| `purpose.surface.jsonl` | generated A2UI surface evidence |
| `purpose.data-model.json` | generated model evidence |
| `purpose-adapter-proof-report.json` | proof report with source/projection digest, checked inputs/outputs, work order, receipt, closed gaps, and residuals |

## Stale and residual handling
A stale work order must be rejected or returned as residual. It must not be silently treated as closed. A receipt with residuals must name its residual handling path so the next ADRS/raw projection can continue the loop.

## Implementation sequence
- #45 introduced the work order for replacing the placeholder purpose artifact.
- #50 closed #45's implementation residual by reading the real Purpose Atlas fixture and producing HTML proof evidence.
- #46 and #47 remain valid as schema/UI work-order documents, but not implementation closure by themselves.
- #48 strengthens the proof with current projection digest, input shape checks, work order freshness, receipt status, and residual handling.
- This PR documents the final non-authoritative boundary after #48.

## Non-scope
- No UI redesign.
- No proof implementation.
- No runtime service changes.

## Acceptance
- Docs do not imply UI is the source of truth.
- Docs distinguish projection, artifact, work order, receipt, and residual.
- Docs name the required upstream inputs and downstream outputs.
- Docs describe stale work order handling: stale projection or work order is rejected or returned as residual, never silently treated as closed.
- Docs point to #45, #50, #46, #47, #48, and this docs PR as the implementation sequence.

## Dependency
Merge after #48, because the wording intentionally follows the proof fields added there.
