# PR1: Core-port package refactor

## Purpose

Move the reusable UI core and port code into a real package and remove the root `src/` implementation exception.

## Scope

- Move root `src/**` to `packages/core-port/src/**`.
- Add `packages/core-port/package.json` for the reusable `ui-modeling-corr-port` package.
- Update root scripts, tests, build scripts, and README references.
- Keep behavior unchanged.

## Non-scope

- Do not move the Purpose Atlas preview app here.
- Do not split fixtures, golden, or reference files here.
- Do not change runtime behavior.

## Target tree

```text
packages/core-port/
  package.json
  src/
    adapters/index.mjs
    a2ui-shell-builder.mjs
    catalog.mjs
    corr-port.mjs
    index.mjs
    log.mjs
    markdown-document-renderer.mjs
    mention-a11y.mjs
    project.mjs
    registry.mjs
```

## Completion conditions

- Root `src/` no longer exists.
- `packages/core-port/src/**` owns the reusable core/port code.
- Existing checks are still wired through `npm test` and `nix flake check`.
- No Purpose Atlas app implementation is introduced into core-port.

## Dependency

This PR should land before the preview app and fixture split PRs.

## Implementation note

This branch now carries the package move itself, not only the delegation plan.
