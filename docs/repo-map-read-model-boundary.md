# repoMap read-model boundary

## Purpose

`repoMap` is a read-model view boundary. UI consumes projection artifacts and renders them. It does not own source model truth, queue runtime, admission, accepted ledger, or projection building authority.

## Shapes

| Shape | Meaning | Owner | UI role |
|---|---|---|---|
| `repoMap.world.v1` | Containment and dependency world: repo, package, model, edge | ops/source model projection | input lineage only |
| `repoMap.lod.v1` | z-level display policy: which nodes and edges are visible at each camera depth | ops/projection policy | consumed, not authored |
| `repoMap.projection.v1` | Renderable read model for a specific view/camera/focus | ops projection builder | direct render input |
| camera state | Runtime-only viewport, pan, zoom, focus hints | local browser runtime | non-authority UI state |

## Data flow

```text
ops accepted/local model
  -> ops repoMap projection builder
  -> repoMap.projection.v1 artifact
  -> ui repoMap preview
```

UI target selection flows separately:

```text
ui repoMap preview
  -> ui.targetRef.v1 metadata
  -> edits queue writer
  -> ops queue runtime
```

## Boundary rules

- UI may render `repoMap.projection.v1`.
- UI may expose `ui.targetRef.v1` for proposal-only local/dev tooling.
- UI may keep camera state in the browser while the preview is open.
- UI must not write queue rows.
- UI must not perform admission.
- UI must not write accepted ledger rows.
- UI must not duplicate the source model or define the canonical projection builder.
- UI must not treat generated preview HTML, screenshots, manifests, or digests as authority.

## Why this exists

The viewer should be easy to explain: ops produces read models, ui renders read models, edits writes human-confirmed queue rows. This keeps the renderer small, replaceable, and safe to transfer.
