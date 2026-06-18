# Purpose Atlas A2UI Data Contract

## `/ui`

```json
{
  "step": 20,
  "maxStep": 40,
  "playing": false,
  "viewMode": "risk",
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
  "id": "mismatch:7:OPS:軌道Telemetryが条件未達成",
  "kind": "mismatch",
  "t": 7,
  "owner": "OPS",
  "target": "軌道Telemetry",
  "label": "ズレとして記録",
  "selection": null,
  "timestamp": "ISO-8601"
}
```
