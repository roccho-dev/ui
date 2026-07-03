# UI E4b required evidence

Required evidence before merge:

- `packages/ui-projection-evidence/readmeProjectionReceipt.v1.jsonl` exists and has non-authority receipt rows.
- `packages/ui-projection-evidence/projection-evidence.v1.json` references the README projection receipt file.
- `packages/ui-receipts/receipt.v1.json` includes the README projection receipt evidence reference.
- `.github/workflows/gov-package-validation.yml` uploads the README projection receipt file.
- `tests/check-ui-package-evidence.mjs` validates the README projection receipt rows.
- `tests/check-ui-gov-package-output.mjs` validates packet input wiring.
