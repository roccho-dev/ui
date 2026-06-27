# PR1: Core-port package refactor

## Purpose

Move the reusable UI core and port code into a real package and remove the root `src/` implementation exception.

## Scope

- Move root `src/**` to `packages/core-port/src/**`.
- Add or update `packages/core-port/package.json`.
- Update imports in tests, scripts, flake outputs, and README references.
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
    index.mjs
    registry.mjs
    catalog.mjs
    project.mjs
    corr-port.mjs
    log.mjs
    a2ui-shell-builder.mjs
    adapters/
      descriptors.mjs
```

## Completion conditions

- Root `src/` no longer exists.
- `packages/core-port/src/**` owns the reusable core/port code.
- Existing checks pass.
- No Purpose Atlas app implementation is introduced into core-port.

## Dependency

This PR should land before the preview app and fixture split PRs.
