# PR3: Purpose Atlas fixture, golden, and reference split

## Purpose

Make names match responsibility: fixtures are input only, golden is expected output only, and old source locks are reference material only.

## Scope

- Move A2UI shell input to `tests/fixtures/purpose-atlas/surface.v0.9.jsonl`.
- Move attached atlas data input to `tests/fixtures/purpose-atlas/atlas-data.json`.
- Move source reference lock material to `tests/reference/purpose-atlas-source/**`.
- Update checks to assert these boundaries.

## Non-scope

- Do not move core/port code.
- Do not move the preview app implementation.
- Do not introduce generated `dist/`, evidence, or manifests as tracked authority.

## Completion conditions

- `tests/fixtures/purpose-atlas/**` contains input data only.
- `tests/reference/purpose-atlas-source/**` contains old source/reference lock material only.
- Boundary checks fail if a buildable app or generated artifact appears under the fixture path.
