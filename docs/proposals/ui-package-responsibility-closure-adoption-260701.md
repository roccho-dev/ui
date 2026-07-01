# UI package responsibility closure adoption implementation

## Purpose

Implement the current UI-side adoption surface for the Package Responsibility Closure Plane.

The goal is to make UI answer the current package closure gap with machine-readable package inventory, package responses, proof, receipts, and residuals.

This PR does not implement the JSX-to-A2UI compiler itself. It implements the required UI response surface so the compiler obligation is no longer silent: the current answer is an explicit residual.

## Implemented surfaces

| Surface | Path | State |
|---|---|---|
| `packageInventory.v1` | `packages/ui-claims/package-responses.v1.jsonl` embedded inventory rows | emitted |
| `packageResponse.v1` | `packages/ui-claims/package-responses.v1.jsonl` | emitted |
| projection proof | `packages/ui-projection-evidence/projection-evidence.v1.json` | emitted |
| artifact boundary proof | `packages/ui-projection-evidence/artifact-boundary-proof.v1.json` | emitted |
| receipt | `packages/ui-receipts/receipt.v1.json` | emitted |
| residual | `packages/ui-receipts/residuals.v1.jsonl` | emitted |

## Primary gap closure

| Gap | Closure |
|---|---|
| UI package inventory is incomplete | UI now emits package inventory rows for source package surfaces. |
| UI response rows do not cover all current UI obligations | UI responses now include implemented responses plus an explicit `ui.jsx-a2ui-compiler` residual response. |
| `ui.jsx-a2ui-compiler` was silent | UI now returns a machine-readable residual and blocked reason without claiming compiler implementation. |
| Generated artifacts could be misread as packages | inventory rows mark source surfaces only and boundary proof keeps generated artifacts non-authority. |

## Boundary

- UI is not ADRS meaning authority.
- Generated HTML, screenshots, previews, reports, and README artifacts are not source package inventory.
- `ui.jsx-a2ui-compiler` is not claimed implemented.
- Strict all-repo governance rollout is not claimed.

## Acceptance

This PR is complete when `tests/check-ui-package-evidence.mjs` and the governance package validation workflow prove the inventory, response, receipt, residual, and overclaim boundaries.
