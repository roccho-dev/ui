# PR2: Purpose Atlas preview package refactor

## Purpose

Move the buildable Purpose Atlas preview app out of `tests/fixtures/` and into a package-shaped implementation boundary.

## Scope

- Move the Vite app, runtime, components, scripts, package files, and tests from `tests/fixtures/purpose-atlas-v6-a2ui/**` to `packages/purpose-atlas-preview/**`.
- Keep the preview build working through Nix.
- Keep generated `dist/`, evidence, and manifests out of git authority.

## Non-scope

- Do not move root core/port code in this PR.
- Do not redefine fixture/golden/reference semantics here except as required for imports.
- Do not adopt generated artifacts as tracked source.

## Target tree

```text
packages/purpose-atlas-preview/
  package.json
  package-lock.json
  vite.config.js
  index.html
  public/a2ui/purpose-atlas.surface.jsonl
  src/
    main.js
    app.js
    runtime/
    domain/
    components/
    a2ui/
    ui/
    styles/
  scripts/
  test/
```

## Completion conditions

- `tests/fixtures/` no longer contains a buildable app package.
- Preview HTML still builds through `.#purpose-atlas-preview-html`.
- The app remains a preview/witness package, not UI core authority.

## Dependency

Stacked after PR1 (`refactor/core-port-package`). Retarget to `proposals` after PR1 lands.

## Implementation note

This branch now carries the preview package move itself, not only the delegation plan. Golden/source lock material remains in `tests/fixtures/purpose-atlas-v6-a2ui/golden` for PR3.
