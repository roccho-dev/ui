# UI E4b merge blockers

Do not merge this PR if any of these are true:

1. README projection receipts are missing from `packages/ui-projection-evidence/readmeProjectionReceipt.v1.jsonl`.
2. The projection evidence does not point to the README projection receipt file.
3. The UI package receipt omits the README projection receipt evidence reference.
4. Preview output is described as final governance closure.
5. The governance package validation artifact omits the README projection receipt file.
6. The PR claims `ui#98` local cutover or org active admission.
