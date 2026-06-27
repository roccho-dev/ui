# PR4: Layout docs, Nix, and CI finalization

## Purpose

Finish the layout migration after the code and data moves are complete, and remove stale path authority from docs, checks, Nix, and CI.

## Scope

- Update README and docs to describe the final tree.
- Keep `flake.nix` outputs and checks on the new package and fixture paths.
- Update catalog/adapter asset paths after PR1, PR2, and PR3 land.
- Remove stale references to the legacy Purpose Atlas fixture app path.

## Target result

```text
packages/core-port/src/**
packages/purpose-atlas-preview/**
tests/fixtures/purpose-atlas/**
tests/reference/purpose-atlas-source/**
```

## Completion conditions

- No repository reference remains to the legacy Purpose Atlas fixture app path.
- Nix checks pass.
- README and docs reflect the final package, fixture, and reference boundaries.
- Generated preview/evidence remains Nix or CI output, not tracked source.
