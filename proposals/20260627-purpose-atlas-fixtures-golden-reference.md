# PR3: Purpose Atlas fixture, golden, and reference split

## Purpose

Make names match responsibility: fixtures are input only, golden is expected output only, and old source locks are reference material only.

## Scope

- Move A2UI surface input to `tests/fixtures/purpose-atlas/surface.v0.9.jsonl`.
- Move atlas data input to `tests/fixtures/purpose-atlas/atlas-data.json`.
- Keep expected snapshots under `tests/golden/purpose-atlas/**` only when they are true expected outputs.
- Move old source lock material to `tests/reference/purpose-atlas-source/**`.
- Update checks to assert these boundaries.

## Non-scope

- Do not move core/port code.
- Do not move the full preview app implementation unless needed only to remove app files from fixtures.
- Do not introduce generated `dist/`, evidence, or manifests as tracked authority.

## Target tree

```text
tests/
  fixtures/
    purpose-atlas/
      surface.v0.9.jsonl
      atlas-data.json
  golden/
    purpose-atlas/
      expected-output-or-snapshot-files
  reference/
    purpose-atlas-source/
      SOURCE_LOCK.json
      source/
```

## Completion conditions

- `tests/fixtures/purpose-atlas/**` contains input data only.
- `tests/golden/purpose-atlas/**` contains expected outputs only.
- `tests/reference/purpose-atlas-source/**` contains old source/reference lock material only.
- Boundary checks fail if a buildable app or generated artifact appears under fixtures.

## Dependency

Can be prepared near PR2, but final merge should avoid conflicting renames with PR2.
