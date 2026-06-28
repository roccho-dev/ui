# Purpose Atlas SDUI layout and CSS separation

## Purpose

Move Purpose Atlas layout, design tokens, and CSS from the Lit component into the A2UI surface JSONL so the renderer becomes a generic SDUI executor.

## Change

- Adds `A2uiSduiSurface` as the active Purpose Atlas component.
- Carries the SDUI layout tree and CSS in `tests/fixtures/purpose-atlas/surface.v0.9.jsonl`.
- Keeps canvas map drawing as a low-level `atlasStage` port only.
- Converts `AtlasSourceSurface` into a thin compatibility alias.
- Removes legacy `source-ui.css` and adds regression checks so layout/CSS cannot drift back into the component.

## Boundary

- JSONL owns layout and CSS.
- Renderer owns execution only.
- Atlas canvas port owns graph drawing only.
- No HTML hand edits and no generated output is tracked.

## Verification

- `npm run check`
- `npm test` inside `packages/purpose-atlas-preview`
- `nix flake check`
