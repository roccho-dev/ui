# Stable repo-map read model boundary

Refs: #119

## Boundary

The repo-map spike IR is promoted to a stable read-model boundary:

```text
repoMap.world.v1
  -> repoMap.lod.v1
  -> repoMap.projection.v1
  -> SVG renderer
  -> svg-pan-zoom camera adapter
```

## Stable kinds

| kind | Role |
|---|---|
| `repoMap.world.v1` | repo/package/model graph |
| `repoMap.lod.v1` | z-level display policy |
| `repoMap.projection.v1` | renderer-ready read model |

## Compatibility

Legacy `map.*` records remain accepted as compatibility input. They are normalized before reducing into the stable world model.

## Invariants

```text
repo = packages[]
package = models[]
```

Generated projections, previews, and manifests remain non-authority evidence. Camera state remains runtime-only and is not written back as accepted model state.
