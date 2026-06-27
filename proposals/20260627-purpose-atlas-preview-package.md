# PR2: Purpose Atlas preview package refactor

## Purpose

Move the buildable Purpose Atlas preview package boundary out of the old fixture location and into `packages/purpose-atlas-preview/**`.

## Scope

- Move the Vite app package files, runtime, components, scripts, package lock, and public A2UI surface to `packages/purpose-atlas-preview/**`.
- Keep the preview build working through Nix.
- Keep generated `dist/`, evidence, and manifests out of git authority.
- Remove the legacy buildable app package files from the old fixture location.

## Non-scope

- Do not move root core/port code in this PR.
- Do not perform the full fixture / golden / reference split here.
- Do not adopt generated artifacts as tracked source.
- Do not delete every old source/reference file here; #33 performs final old-path cleanup after #32 establishes the new fixture/reference boundary.

## Target tree

```text
packages/purpose-atlas-preview/
  package.json
  package-lock.json
  vite.config.js
  index.html
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
```

## Completion conditions

- `tests/fixtures/` no longer contains a buildable app package.
- Preview HTML still builds through `.#purpose-atlas-preview-html`.
- The app remains a preview/witness package, not UI core authority.
- Remaining old source/reference cleanup is explicitly deferred to the final stacked cleanup PR.

## Dependency

After PR1. Final import paths follow the core-port package shape.
