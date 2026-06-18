# Purpose Atlas A2UI-Described Surface Proposal

Status: proposal

This proposal supersedes the golden-witness import direction. The purpose is to
let Codex and other agents construct and revise the UI from repo-local JSONL and
A2UI records, not to preserve a visual golden as an authority.

## Claim

`packages/purpose-atlas-a2ui-surface` is an A2UI-described exit surface. Its UI
shape is declared by native A2UI v0.9 records:

- `createSurface`
- `updateComponents`
- `updateDataModel`

The registry carries the Purpose Atlas component family as multiple addressable
components: `AtlasShell`, `AtlasHeader`, `AtlasToolbar`, `AtlasCanvas`,
`AtlasInspector`, and `AtlasToast`.

## Why This Replaces Golden

A golden UI is the wrong authority for this purpose. If the system goal is that
agents can rewrite UI by changing A2UI/JSONL, the review gate must inspect the
A2UI description and resulting runtime behavior, not protect one frozen visual
source.

Therefore this proposal intentionally excludes:

- `golden/`
- golden witness locks
- generated `dist/`
- checked-in `node_modules`

## Boundary

The package remains an exit surface only:

```text
raw JSONL in repos
  -> canonical/projection layer
  -> resolved a2ui.context.surface.v1
  -> adapter
  -> A2UI v0.9 message stream
  -> Purpose Atlas UI components
```

`ui.git` owns the component descriptors and renderer-neutral shape. It does not
own purpose, role, policy, guard, approval, fire, merge, or graph projection
authority.

`src/domain/atlas-engine.js` and `src/data/atlas-data.json` remain fixture/demo
material until `/atlas` is supplied by an external resolved context surface.

## Acceptance

This proposal is acceptable only if:

- the registry remains stateless and renderer-neutral;
- the Purpose Atlas UI is described by A2UI records, not by a golden visual;
- all Purpose Atlas A2UI components are registered;
- package tests and static verification pass under Nix;
- the next adapter can replace browser-side demo `/atlas` with external
  `a2ui.context.surface.v1` without changing the UI component contract.

## Verification Scope

The root Nix check is the merge gate for `ui.git`. It verifies the registry,
that all six Purpose Atlas components are registered, that the A2UI surface uses
the expected catalog id and component list, that DataModel bindings stay under
the allowed roots, that no executable payload keys/text are present, that
component props are allowlisted, and that registry-declared actions match the
15 action names used by the A2UI surface.

The package-level `npm run verify` remains developer evidence for the embedded
demo package: it runs the package's node tests, A2UI lint, Vite build, and
static verification. It is not the root merge gate and must not be read as a
semantic authority claim for `/atlas`.
