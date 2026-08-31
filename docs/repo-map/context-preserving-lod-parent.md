# Context-preserving repo map LOD parent plan

Refs: #116

## Purpose

This parent change anchors the implementation plan for preserving map context outside focus during repo map semantic LOD.

The current repo map artifact can prove containment and camera-adapter boundaries, but its LOD is focus-only:

```text
z < 24:
  all repos

24 <= z < 66:
  focus repo + packages only

z >= 66:
  focus package neighborhood + models only
```

The goal of #116 is to keep the map world visible while zooming into semantic detail.

## Non-negotiable invariant

```text
repo = packages[]
package = models[]
```

Visual containment must remain:

```text
repo rect
  package rect[]
    model rect[]
```

## Boundary

The boundary remains:

```text
JSONL data
  -> CRUD event contract
  -> model graph reducer
  -> projection / LOD reducer
  -> coordinate-preserving SVG renderer
  -> svg-pan-zoom camera adapter
```

`svg-pan-zoom` remains camera-only. It must not own semantics, containment, LOD policy, projection, label policy, or generated artifact authority.

## Target policy

Projection should distinguish these view-only roles:

```text
detail
context
hidden
```

Suggested projection fields:

```text
visibilityRole: detail | context
interactionRole: active | passive
labelRole: full | short | hidden
```

These fields are projection/read-model fields, not source JSONL authority.

## Intended z behavior

| z | detail | context | hidden |
|---:|---|---|---|
| far | all repos | none | packages/models |
| middle | focus repo packages | all repos | non-focus packages/models |
| near | focus package models | all repos + focus repo packages + sibling packages | non-focus models |

## Implementation sequence

1. Add reducer tests that fail on focus-only LOD.
2. Add context/detail projection roles.
3. Keep non-focus repos visible at middle and near z.
4. Render context nodes visually quieter than detail nodes.
5. Keep edges bounded to focus neighborhood.
6. Add desktop/mobile visual gates proving context preservation.
7. Publish generated HTML, runtime report, and screenshots as non-authority CI evidence.

## Acceptance gates

- z=middle keeps all repos or a documented context-preserving equivalent visible.
- z=near keeps repo context visible.
- focus details remain readable.
- package/model containment still passes.
- labels do not explode or dominate detail.
- product UI remains only `-`, `+`, and `fit`.
- generated HTML remains evidence, not authority.

## Parent PR rule

This parent PR should not claim completion of #116 until child implementation commits or PRs prove the context-preserving LOD behavior in CI and screenshots.
