# PR4: Purpose Atlas final layout cleanup

## Purpose

Finalize the Purpose Atlas layout after the preview package and clean fixture/reference boundary changes.

## Scope

- Update README and Purpose Atlas docs to the final package / fixture / reference layout.
- Point catalog A2UI asset metadata at the fixture input path.
- Add a final layout check that rejects legacy fixture app paths, tracked package-side generated JSONL/data copies, and Python files in the source reference sentinel.
- Keep generated preview output as Nix or CI output, not tracked source.

## Non-scope

- Do not move the preview app package.
- Do not change core-port implementation.
- Do not add generated dist/evidence/manifest files.

## Completion conditions

- `tests/fixtures/purpose-atlas-v6-a2ui` is absent.
- `packages/purpose-atlas-preview/public/a2ui/purpose-atlas.surface.jsonl` is absent as tracked source.
- `packages/purpose-atlas-preview/src/data/atlas-data.json` is absent as tracked source.
- Source reference sentinel contains no Python file.
- Nix checks pass.
