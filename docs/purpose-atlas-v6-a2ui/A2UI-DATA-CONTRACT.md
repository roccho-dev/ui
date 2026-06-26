# Purpose Atlas A2UI Data Contract

## Authority boundary

Purpose Decision Atlas v6 accepts `ADRS projected input` (`adrs projected input`)
at the runtime input boundary. ADR/domain state authority is external to
`ui.git`; this repo owns the UI contract, registry, ports, build, and
verification boundary only.

The implementation is `core+port as lib`:

- core: deterministic projection, replay, witness, validation, and atlas
  view-model logic
- port: ADRS projected input boundary, A2UI build boundary, and render/verify
  boundary

A2UI is `a2ui as build`. A2UI surface JSONL and runtime surfaces are build
outputs derived from the UI contract and input. They are not source-of-truth
ADR/domain state.

JSONL in this repo is `jsonl as attached data`. Fixtures and preview data are
allowed for tests, replay, and witness evidence only. They must be
`stateless` and `non-authoritative`, and they must be replaceable by ADRS
projected input without changing the UI contract.

Contract terms:

```text
inputKind: ADRS projected input
inputAuthority: external to ui.git
uiContractAuthority: ui.git UI contract
a2uiTreatment: a2ui as build
jsonlTreatment: jsonl as attached data
fixturePolicy: stateless, non-authoritative
stateStorePolicy: ui.git is not a state store
```

`ui.git is not a state store`. `/ui`, `/atlas`, `/operations[]`, replay state,
and runtime interaction state are render/runtime behavior only. They must not be
treated as canonical ADR/domain decisions, CEO judgment completion, owner
approval, merge readiness, fire authorization, or operation authority.

Invalid fixture/build-output authority fields include:

```text
approval
approvalStatus
canonicalState
mergeReady
authorizesFire
authorizesMerge
ownerDecisionAccepted
decisionAccepted
```

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
