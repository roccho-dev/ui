# UI README projection receipt boundary

This document records the Phase E4b boundary for `ui#97`.

## Purpose

Expose UI README projection receipt evidence as downstream governance input without claiming final organization admission.

## Evidence surfaces

- `packages/ui-projection-evidence/readmeProjectionReceipt.v1.jsonl`
- `packages/ui-projection-evidence/projection-evidence.v1.json`
- `packages/ui-receipts/receipt.v1.json`
- `.github/workflows/gov-package-validation.yml`
- `tests/check-ui-package-evidence.mjs`
- `tests/check-ui-gov-package-output.mjs`

## Boundary

The UI repository remains a renderer/projection evidence producer. Generated preview output, README text, and packet artifacts are non-authority evidence only. Final active admission is still owned by the governance final join after upstream cutover.
