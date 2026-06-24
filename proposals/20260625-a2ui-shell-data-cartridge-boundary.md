# Proposal: A2UI Shell + Data Cartridge boundary for `ui`

## 1. Purpose generations

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

## 2. Decision

`ui` should not treat product HTML as source authority. The durable UI contract should be an A2UI shell, a component catalog, a data contract, and renderer behavior.

Adopt the **A2UI Shell + Data Cartridge** boundary:

- **A2UI Shell**: surface, component tree, binding paths, actions/events, empty/loading/error states.
- **Data Contract**: paths, types, limits, sensitivity classes, and missing-data behavior required by the shell.
- **Data Cartridge**: operational JSONL-derived data or A2UI `updateDataModel` messages supplied after shell build.

The `ui` shell must build with no data.

Operational JSONL data may be projected into an A2UI data model and attached later through A2UI `updateDataModel`, not by editing generated HTML or touching the DOM directly.

## 3. Direction

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

```text
Forbidden:
JSONL → HTML string replacement
JSONL → direct DOM mutation
JSONL → arbitrary component definition
JSONL → approval / merge / fire authority

Allowed:
JSONL → data projector → updateDataModel → A2UI processor
```

## 4. Scope

| Subject | Treatment |
|---|---|
| A2UI shell build | Durable `ui` responsibility |
| data contract | Durable `ui` responsibility |
| component catalog | Durable `ui` responsibility |
| renderer implementation | Durable `ui` responsibility |
| UI JSONL model | Preview input; do not merge as durable product data |
| HTML artifact | Generated preview; do not merge |
| production data | Do not store in `ui` source |
| `adrs/raw` | Do not consume as authority inside `ui` |

## 5. Non-goals

- Do not add handwritten product HTML as source.
- Do not let `ui` write back to `adrs`.
- Do not let `ui` make ADR acceptance, merge approval, or fire authorization decisions.
- Do not let JSONL data define new component trees or arbitrary HTML.
- Do not let data adapters own UI layout.
- Do not treat browser storage or runtime state as authority.
- Do not merge preview artifacts.
- Do not merge per-conversation UI JSONL models as durable product contracts.

## 6. Required separation

### 6.1 A2UI declaration

A2UI declaration may contain:

- surface id
- catalog id
- component id
- component type
- parent/child relation
- binding path
- action name
- event name
- empty/loading/error state
- static operation labels

A2UI declaration must not contain:

- business data
- `adrs/raw` body text
- user-specific data
- secrets
- approval state
- merge readiness
- fire authorization
- arbitrary HTML

### 6.2 Data contract

Data contract may contain:

- required path
- optional path
- type
- list upper bound
- sensitivity class
- missing-data behavior
- accepted semantic family

Data contract must not contain:

- actual data
- API endpoint
- token
- retry policy
- polling interval
- UI layout
- DOM selector

### 6.3 Data cartridge

Data cartridge may contain:

- JSONL-derived records
- normalized data model
- `updateDataModel` messages
- projection digest
- source digest
- non-authority receipt

Data cartridge must not contain:

- `createSurface`
- `updateComponents`
- component type definitions
- action endpoint overrides
- arbitrary HTML
- approval / merge / fire authority

## 7. Build modes

### 7.1 Shell build

```text
input:
  surface.a2ui.jsonl
  component catalog
  data-contract.cue/json
  renderer implementation

output:
  ui-shell artifact
```

Shell build must succeed with no data.

Expected behavior:

- empty view renders
- loading view renders
- missing data path does not throw
- shell digest is stable

### 7.2 Preview build

```text
input:
  ui-shell artifact
  temporary UI JSONL model
  data projector

output:
  preview artifact
```

Preview artifact includes:

```text
index.html
surface.a2ui.jsonl
data-model.jsonl
projection.json
verification-receipt.json
MANIFEST.sha256
```

Preview artifact is non-authority and must not be merged.

### 7.3 Runtime mode

Runtime mode may use file, GET, SSE, WebSocket, or other transport through a host adapter.

A2UI declaration does not own transport.

Transport adapter receives external data, validates it, projects it to an A2UI data model, then sends `updateDataModel`.

## 8. CI gates

| Gate | Failure condition |
|---|---|
| no-source-html | Source contains manually authored product HTML |
| shell-build-without-data | Shell cannot build without data |
| no-data-in-a2ui-declaration | A2UI declaration contains business data |
| no-structure-in-data | Data cartridge contains `createSurface` or `updateComponents` |
| no-html-in-data | Data contains raw HTML |
| no-authority-fields | Data/assertions contain approval, merge, fire, or canonical state |
| binding-path-valid | A2UI binding path is not declared in data contract |
| missing-data-safe | Missing data crashes shell |
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

## 9. Migration plan

| Step | Change |
|---:|---|
| 1 | Define A2UI shell / data contract / data cartridge terms |
| 2 | Split combined A2UI streams into structure stream and data stream |
| 3 | Add shell build with no data |
| 4 | Add empty/loading/error smoke test |
| 5 | Add data projector from UI JSONL model to `updateDataModel` |
| 6 | Add HTML artifact generation from shell + data cartridge |
| 7 | Ban product source HTML except generated examples/witnesses |
| 8 | Move current Purpose Atlas root HTML toward generated artifact |
| 9 | Keep old combined stream through compatibility adapter temporarily |
| 10 | Remove compatibility adapter after equivalent previews are proven |

## 10. Acceptance criteria

This proposal is accepted when:

1. `ui` can build an A2UI shell with no data.
2. Data changes do not change shell digest.
3. JSONL data is applied only through A2UI `updateDataModel`.
4. HTML is generated, not manually authored as product source.
5. UI JSONL models remain preview-only and are not merged as product contracts.
6. Generated artifacts explicitly state non-authority.
7. CI fails if data attempts to define UI structure or authority.
8. Existing Purpose Atlas preview can be represented through the same shell/data split or a documented compatibility adapter.

## 11. Final rule

`ui` owns the human-facing UI contract.

That contract is:

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

Final architecture:

```text
A2UI Shell
  built from A2UI declaration only

Data Cartridge
  projected from JSONL

Binding
  performed through updateDataModel

HTML
  generated artifact only
```
