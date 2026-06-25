# Proposal: A2UI Shell + Data Cartridge boundary for `ui`

## Purpose generations

| Generation | Purpose |
|---:|---|
| G0 | Generate UI only from A2UI, not handwritten product HTML |
| G1 | Separate A2UI UI declarations from JSONL data |
| G2 | Build the `ui` shell with no data |
| G3 | Allow operational JSONL data to be attached later |
| G4 | Avoid rebuilding the UI shell when only data changes |
| G5 | Prevent data from carrying arbitrary HTML, components, or authority |
| G6 | Validate A2UI contract, data contract, and renderer behavior separately |
| G7 | Use the same boundary for preview and runtime use |
| G8 | Make the UI/data boundary explainable to third parties |
| G9 | Improve corporate sale and business transfer readiness |

## Decision

Adopt the **A2UI Shell + Data Cartridge** boundary.

`ui` should not treat product HTML as source authority. The durable UI contract is:

```text
A2UI shell
+ component catalog
+ data contract
+ renderer behavior
```

It is not:

```text
HTML source
+ embedded business data
+ adrs/raw authority
+ runtime transport policy
```

The `ui` shell must build with no data. Operational JSONL data may be projected into an A2UI data model and attached later through A2UI `updateDataModel`, not by editing generated HTML or touching the DOM directly.

## Direction

```text
A2UI declaration
+ component catalog
+ data contract
+ renderer implementation
  ↓
build UI shell
  ↓
shell artifact

UI JSONL model / domain JSONL
  ↓
data projector
  ↓
A2UI updateDataModel messages
  ↓
preview linker / runtime adapter
  ↓
HTML preview or runtime DOM
```

The binding point is the A2UI processor, not generated HTML.

Forbidden:

```text
JSONL → HTML string replacement
JSONL → direct DOM mutation
JSONL → arbitrary component definition
JSONL → approval / merge / fire authority
```

Allowed:

```text
JSONL → data projector → updateDataModel → A2UI processor
```

## Boundary

This proposal does not implement the final shell compiler. It adds an executable, architecture-only invariant check to prove the boundary can be mechanically tested before implementation work.

This proposal does not merge generated HTML or per-conversation UI JSONL models as durable product contracts.

## Required separation

A2UI declaration may contain surface id, catalog id, component type, parent/child relation, binding path, action/event name, and empty/loading/error state.

A2UI declaration must not contain business data, `adrs/raw` body text, secrets, approval state, merge readiness, fire authorization, or arbitrary HTML.

Data contract may contain required paths, optional paths, types, upper bounds, sensitivity class, and missing-data behavior.

Data contract must not contain actual data, API endpoints, tokens, retry policy, polling interval, UI layout, or DOM selectors.

Data cartridge may contain JSONL-derived records, normalized data model, `updateDataModel` messages, projection digest, source digest, and non-authority receipt.

Data cartridge must not contain `createSurface`, `updateComponents`, component type definitions, action endpoint overrides, arbitrary HTML, approval, merge, or fire authority.

## CI gates

| Gate | Failure condition |
|---|---|
| shell-build-without-data | Shell cannot build without data |
| no-data-in-a2ui-declaration | A2UI declaration contains business data |
| no-structure-in-data | Data cartridge contains `createSurface` or `updateComponents` |
| no-html-in-data | Data contains raw HTML |
| no-authority-fields | Data/assertions contain approval, merge, fire, or canonical state |
| binding-path-valid | A2UI binding path is not declared in data contract |
| shell-digest-stable | Shell digest changes when only data changes |
| data-digest-changes | Data changes but data digest does not change |
| artifact-non-authority | Receipt lacks non-authority marker |

Most important invariant:

```text
same A2UI + same catalog + same data contract + same renderer = same shell digest

data A  → shell digest X
data B  → shell digest X
dataなし → shell digest X
```

Only these may change:

```text
data digest
combined preview digest
rendered content
verification receipt
```

## Nix proof

The proposal adds a dedicated Nix check:

```text
checks.<system>.a2ui-shell-data-design-invariants
```

The check runs `tests/check-a2ui-shell-data-boundary.mjs` and verifies:

- shell contains `createSurface` and `updateComponents`
- shell rejects `updateDataModel`
- data cartridge contains only `updateDataModel`
- root `/` updates are rejected
- undeclared data paths are rejected
- raw HTML in data is rejected
- authority fields such as `mergeReady` are rejected
- shell digest is stable across data changes
- data digest changes when data changes
- preview digest changes when data changes
- generated artifacts remain non-authority

## Acceptance criteria

This proposal is accepted when:

1. `nix flake check --print-build-logs` passes on GitHub Actions.
2. The PR remains focused on proposal text, the architecture-only invariant test, and CI wiring.
3. No generated HTML or per-conversation UI JSONL model is merged.
4. Future implementation PRs prove shell digest stability across data changes and generate HTML from A2UI only.
