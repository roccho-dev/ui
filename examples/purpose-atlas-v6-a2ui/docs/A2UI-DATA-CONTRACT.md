# Purpose Atlas A2UI Data Contract

## `/ui`

```json
{
  "step": 20,
  "maxStep": 40,
  "playing": false,
  "viewMode": "responsibility",
  "viewport": {
    "initialized": true,
    "zoom": 0.67,
    "panX": 12,
    "panY": 28,
    "fitNonce": 1
  },
  "selection": {
    "type": "responsibility",
    "nodeId": "ceo_orbit_mission",
    "actor": "CTO"
  }
}
```

`viewMode`は`purpose`、`responsibility`、`focus`のいずれかです。

## `/atlas`

```text
version / protocolVersion
world
currentPurposeId / currentPurpose
lastEvent / lastEventLabel
guard
nodes[]
edges[]
responsibility[nodeId]
currentComposition[]
eventLog[]
cxo
counts
```

すべてJSON serializableです。DOM、Canvas、class instance、functionは含みません。

## `/atlas/responsibility/{nodeId}`

```json
{
  "composition": [
    {"actor": "CTO", "value": 4, "ratio": 0.25}
  ],
  "branches": {
    "CTO": {
      "nodeIds": ["cto_pkg_core", "cto_audit_log"],
      "edgeIds": ["e_cto_1", "e_cto_3"]
    }
  }
}
```

## `/operations[]`

```json
{
  "id": "mismatch:7:CTO:launch readinessが条件未達成",
  "kind": "mismatch",
  "t": 7,
  "owner": "CTO",
  "target": "launch readiness",
  "label": "ズレとして記録",
  "selection": null,
  "timestamp": "ISO-8601"
}
```

重複keyは`kind + step + owner + guard text`です。

## A2UI root bindings

```text
snapshot    → /atlas
step        → /ui/step
maxStep     → /ui/maxStep
playing     → /ui/playing
viewMode    → /ui/viewMode
viewport    → /ui/viewport
selection   → /ui/selection
events      → /events
operations  → /operations
toast       → /toast
```

## Actions

```text
atlas.reset
atlas.previous
atlas.next
atlas.togglePlay
atlas.stepChanged
atlas.modeChanged
atlas.fit
atlas.zoomIn
atlas.zoomOut
atlas.select
atlas.recordMismatch
atlas.requestOwner
atlas.holdDecision
atlas.stepForward
atlas.clearSelection
```
