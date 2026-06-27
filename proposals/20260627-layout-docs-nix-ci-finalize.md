# PR4: Layout docs, Nix, and CI finalization

## Purpose

Finish the layout migration after the code and data moves are complete, and remove stale path authority from docs, checks, Nix, and CI.

## Scope

- Update README and docs to describe the final tree.
- Update `flake.nix` outputs and checks to use the new package and fixture paths.
- Update CI references if needed.
- Update catalog/adapter asset paths after PR1, PR2, and PR3 land.
- Remove every stale reference to `tests/fixtures/purpose-atlas-v6-a2ui`.

## Non-scope

- Do not perform the core-port package move here.
- Do not perform the preview app move here.
- Do not perform the fixture/golden/reference split here.
- Do not add generated artifacts to git.

## Target result

```text
packages/core-port/src/**
packages/purpose-atlas-preview/**
tests/fixtures/purpose-atlas/**
tests/golden/purpose-atlas/**
tests/reference/purpose-atlas-source/**
docs/purpose-atlas-v6-a2ui/**
```

## Completion conditions

- No repository reference remains to `tests/fixtures/purpose-atlas-v6-a2ui`.
- Nix checks pass.
- README and docs reflect the final package, fixture, golden, reference, and artifact boundaries.
- Generated preview/evidence remains Nix or CI output, not tracked source.

## Dependency

This PR is last. It should be based after PR1, PR2, and PR3 have landed or be rebased after them.
