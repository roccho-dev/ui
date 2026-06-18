# ui

`ui` owns the **A2UI / SDUI component registry** and the core/port library
boundary. It is the single source of truth (SSOT) for *what UI components
exist*, *what they accept and produce*, and *how recursive UI node trees project
into renderer-neutral view models*.

This repo keeps runtime ingress and rendering out. Collectors, Caddy, and
durable process supervision belong to operational repos. Browser DOM, HTML, and
CSS belong to adapters/examples. `ui` accepts JSONL records as input and
produces renderer-neutral projections.

## Scope

- `ui.component.registry.v1`: the component registry contract (ids, versions,
  accepted input kinds, produced output kinds, props/state/events, adapter
  assets, stability).
- A default catalog of A2UI/SDUI components: primitives, layout, action, slide,
  and questionnaire/flow families, plus `need_zoom` surface components.
- Recursive node-tree projection with deterministic handling of unknown types.
- `targetRef` for UI logs/actions/requests so records route to model elements.
- Port/adapter **descriptors** for HTML, CSS, JS, and future CLI/TUI surfaces.

## Non-Scope

`ui` is one of several SSOT repos that touch browser UI. It owns the component
registry contract and renderer-neutral component-tree projection only. The
adjacent responsibilities below belong to sibling repos — see
[`docs/ownership-boundaries.md`](docs/ownership-boundaries.md) for the full
inventory, overlap map, and per-responsibility owner.

- HTTP collectors, Caddy configuration, durable supervision — `ops`.
- Browser hosting / static host and `dist/` + `/boards/*` serving — `webmcp`.
- Board composition and `board-view.ir.v1` projection authority — `board-view`.
- IR → HTML command-board rendering and host artifacts — `render-worktrees-agents`.
- SDUI policy / validation authority — `policy` (`packages/sdui-policy-gate`);
  `ui` supplies the registry shape that gate consumes, it does not validate.
- Browser-only renderer ownership (adapters/examples carry DOM).
- Canonical business state, approval, merge, or fire authority.

## Core / Port / Adapter boundary

| Layer | Files | Owns |
|---|---|---|
| Core | `src/registry.mjs`, `src/catalog.mjs`, `src/project.mjs`, `src/corr-port.mjs`, `src/log.mjs` | registry contract, catalog, projection, logs — **no DOM** |
| Adapter descriptors | `src/adapters/index.mjs` | declarations of what a host may mount; no renderer state |
| Examples | `examples/`, `fixtures/*.jsonl` | sample inputs and a headless projection run |

The reference HTML/JS demos (the A2UI bundle and questionnaire PoC) are
example/adapter material only. They are not registry authority.

## The registry contract: `ui.component.registry.v1`

A registry is a list of `ui.component.entry.v1` entries. Each entry:

```js
{
  kind: "ui.component.entry.v1",
  id: "Choice",                 // recursive node type / SDUI component id
  version: "v1",
  family: "questionnaire",      // open label; new families need no schema change
  stability: "stable",          // experimental | stable | deprecated
  acceptsInputKinds: ["ui.node.v1"],
  producesOutputKinds: ["html.element", "sdui.component.v1"],
  props: ["value", "label", "next", "questionId", "hint"],
  state: ["/questionnaire/answers"],
  events: ["AnswerEvent"],
  actions: ["answer.set", "question.go"],
  childrenPolicy: "recursive",  // recursive | none | templated | generated
  adapterAssets: {},
  allowedSurfaceIds: null,       // null = any SDUI surface
}
```

Schemas live in `schemas/`:
`component-registry.schema.json`, `component-entry.schema.json`,
`ui-node.schema.json`, `ui-log-targetref.schema.json`.

This registry shape is consumed unchanged by
`policy/packages/sdui-policy-gate` (`validateSduiPolicySurface({ componentRegistry })`):
unregistered components in an SDUI response are flagged `component_not_registered`.

## How to add a component (no schema change)

```js
import { defineComponent, makeRegistry, defaultEntries } from "ui-modeling-corr-port";

const FormField = defineComponent({
  id: "FormField",
  family: "form",              // brand-new family, no schema churn
  stability: "experimental",
  props: ["name", "kind", "required"],
  events: ["FieldChange"],
  childrenPolicy: "none",
});

const registry = makeRegistry([...defaultEntries, FormField]);
registry.has("FormField"); // true
```

Adapters then add a handler keyed by `id`; the core registry is untouched.

## How to use a component (project JSONL → view model)

```js
import { defaultRegistry, projectA2uiSurface, projectQuestionnaireFlow } from "ui-modeling-corr-port";

const registry = defaultRegistry();

// A2UI recursive JSONL (TreePatch/StatePatch) -> renderer-neutral view model
const surface = projectA2uiSurface(records, registry);
//  -> { kind: "ui.surface.viewmodel.v1", tree, state, emittableEvents, errors }

// Standalone questionnaire flow JSONL -> registry-driven component tree
const flow = projectQuestionnaireFlow(flowRecords, registry);
//  -> tree.root.type === "QuestionFlow", every node registered
```

Unknown node types are deterministic: `projectNodeTree` annotates them
`registered: false` and lists them in `unknownTypes`; it never throws.

Run the headless example (no browser):

```sh
npm run example        # node examples/project-registry.mjs
```

## Logs are targetable and non-authority

Every UI log/action/request carries an explicit `targetRef` so it can be routed
to the model element it concerns (purpose, org member/CXO, product, contract,
evidence, relation/edge, generation/meta layer, projection/view node) even after
the UI changes:

```js
import { toUiLog, makeTargetRef } from "ui-modeling-corr-port";

const record = toUiLog(
  { kind: "ui.log.record.v1", event: "contract.flag" },
  { targetRef: makeTargetRef({ kind: "contract", id: "contract:exit-2026" }) }
);
// record.meta.canonicalStatus === "ui-log-not-authority"
// record.meta.approval === false, authorizesFire === false, authorizesMerge === false
```

A UI record is **never** SSOT approval, merge approval, or fire authorization.
`toUiLog` throws if a payload tries to assert an authority field
(`mergeReady`, `canonicalState`, ...), mirroring the `sdui-policy-gate` boundary.

## Verify

```sh
npm test                 # node --check all sources + tests/run-all.mjs
nix flake check          # evaluate flake outputs
nix build .#checks.x86_64-linux.ui-modeling-corr-port   # run the check in the sandbox
```

`tests/check-ui-modeling.mjs` (existing `need_zoom` projection) and
`tests/check-registry.mjs` (registry/projection/log) both run under
`tests/run-all.mjs`, used by `npm test` and the Nix check alike.

## Adapter descriptors

Adapters are descriptors only. They declare what a host may mount; they do not
own renderer state. CLI/TUI adapters can be added without changing the core
registry schema.

- `htmlBox`, `cssBox`, `jsBox` (need_zoom surface)
- `questionnaireHtmlBox` (A2UI/SDUI view model)
- `cliBox` (future text surface)

## Provenance

Component families are derived from reference material, not adopted as authority
verbatim:

- `a2ui_adapter_split_poc_bundle.zip` → primitive/layout/action/slide/questionnaire entries; `fixtures/a2ui-recursive.demo.jsonl`.
- `questionnaire-js-poc` → questionnaire flow integration; `fixtures/questionnaire.flow.jsonl`.

The zips are reference/proposal inputs. This repo is the SSOT.
