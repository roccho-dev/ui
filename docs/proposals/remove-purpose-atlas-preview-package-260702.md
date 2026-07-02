# Remove residual Purpose Atlas preview package

## Purpose

This PR exists to cover the remaining gap after #76: the retired `packages/purpose-atlas-preview` implementation still physically exists in the repository.

## Boundary

This is a handoff shell PR. This commit does not remove files, change code, or perform the implementation.

## Required completion

- Physically remove the retired `packages/purpose-atlas-preview` package if it is no longer current.
- Remove or update references that become invalid after the package deletion.
- Keep the promoted/current purpose visualization contract in `core-port` and fixture-based checks.
- Add only current-fact deletion checks.
- Do not add tombstones, future-retirement markers, old-name-only guards, or history reducers.

## Merge condition

Do not merge this handoff shell as-is. Merge only after the physical deletion and current-fact checks are implemented and CI is green.
