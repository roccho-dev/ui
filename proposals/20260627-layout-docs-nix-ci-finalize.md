# PR4: Layout docs, Nix, and CI finalization

## Purpose

Finish the layout migration after the fixture/reference boundary lands, and remove stale path authority from docs, checks, catalog, and tracked files.

## Scope

- Update README and docs to describe the final tree.
- Update catalog asset paths to the fixture source path.
- Keep package preview JSONL/data generated from fixtures via sync script, not tracked as package authority.
- Remove legacy Purpose Atlas fixture app path.
- Add final layout checks.

## Completion conditions

- No tracked legacy `tests/fixtures/purpose-atlas-v6-a2ui` path remains.
- `packages/purpose-atlas-preview/public/a2ui/purpose-atlas.surface.jsonl` and `packages/purpose-atlas-preview/src/data/atlas-data.json` are generated from fixtures, not tracked source.
- No Python file remains in the source reference sentinel.
- Nix checks pass.
