# UI package response and evidence work order

## Purpose

Open the UI-side adoption PR for the package obligation system.

UI must emit package-level responses for projection and artifact evidence surfaces and run governance-provided package checks in CI.

## Scope

Define the work order for:

- `packages/ui-claims`
- `packages/ui-projection-evidence`
- `packages/ui-receipts`
- `.github/workflows/gov-package-validation.yml`

## Required UI outputs

- `claim_id`
- `adrs_ref`
- `obligation_id`
- `repo_locator`
- `package_id`
- `package_path`
- `owner_role`
- `state`
- `covered_requirements[]`
- `protected_non_goals[]`
- `test_refs[]`
- `evidence_refs[]`
- `receipt_ref`
- `residuals[]`
- `evidence_freshness`
- `overclaim_boundary`

## UI-specific evidence

- projection build result
- README-as-artifact proof
- generated artifact boundary proof
- screenshot or HTML artifact refs where required
- residual projection refs

## Non-goals

- Do not make UI source authority.
- Do not treat generated artifacts as ADRS meaning.
- Do not claim projection adoption without proof.

## Acceptance

Future implementation should produce UI package responses and run the exported governance checks from UI CI.
