# Remove residual Purpose Atlas preview package

## Purpose

This PR covers the remaining gap after #76: the retired `packages/purpose-atlas-preview` implementation still physically existed in the repository after its public Nix and workflow surfaces were removed.

## Implemented change

- Removed the retired `packages/purpose-atlas-preview` package files.
- Removed the stale `tests/check-purpose-atlas-upload-artifact.mjs` check for the retired preview artifact path.
- Kept the promoted current purpose visualization contract in `core-port` and fixture-based checks.
- Kept the current-fact absence check in `tests/check-purpose-atlas.mjs`.
- Added no tombstones, future-retirement markers, old-name-only guards, or history reducers.

## Completion evidence required before merge

This PR can only be considered complete when all of the following are true:

1. `packages/purpose-atlas-preview` is absent from the changed tree.
2. `tests/check-purpose-atlas.mjs` fails if the retired preview package directory exists.
3. The current purpose projection contract still checks `A2uiSduiSurface`, `purpose-atlas`, closure object text, gap/work order/receipt/residual data kinds, and minimum review actions.
4. Root package workspace remains `packages/core-port` only.
5. Nix and workflow public surfaces do not rebuild or upload the retired preview package.
6. CI is green.

## Merge condition

Keep this PR open for explicit human merge approval after the evidence above is checked.
