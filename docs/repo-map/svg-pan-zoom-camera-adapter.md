# svg-pan-zoom camera adapter spike

Refs: roccho-dev/ui#114

## Invariant

```text
repo = packages[]
package = models[]
```

## Decision under test

Use `svg-pan-zoom` only as a camera adapter for pan / zoom / fit.

The renderer remains coordinate-preserving SVG. The semantic rules remain in the headless core:

```text
JSONL data
  -> CRUD event contract
  -> model graph reducer
  -> projection / LOD reducer
  -> coordinate-preserving SVG renderer
  -> svg-pan-zoom camera adapter
```

## Boundary

`svg-pan-zoom` may own camera movement only. It must not own repo/package/model semantics, containment, dependency relations, LOD, font policy, projection, state authority, or generated artifact authority.

## Product UI

The product UI is limited to:

```text
-
+
fit
```

Debug HUD, z text, and repo button rows are not product UI.
