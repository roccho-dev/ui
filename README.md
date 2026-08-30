# ui

`ui` is the source registry for executable UI capabilities and reusable UI components.

Given an exact input, this repository must make four facts discoverable without reading deployment code:

1. which capability accepts the input;
2. which exact source engine renders it;
3. which typed events or receipts it may emit;
4. which checked-in input and generated example output demonstrate the contract.

`ui` does not own accepted business state, queue rows, production ledgers, deployment authority, or runtime admission.

## Two registries

| Registry | Question it answers | Source |
|---|---|---|
| Component registry | Which recursive UI node/component IDs can a renderer execute? | `schemas/component-entry.schema.json` and `packages/a2ui-adapter-artifacts/registry.json` |
| Capability registry | What exact input can be sent, what will be rendered or executed, and what typed output may be returned? | `apps/artifact-shell/capabilities/<slug>/manifest.json` |

The checked-in `apps/artifact-shell/generated/capability-registry.mjs` is a generated shell index. Capability manifests are the source declarations.

## Current executable capabilities

| Capability | Accepts | Produces |
|---|---|---|
| `inspect.json@1` | one `application/json` blob | `json-inspection/1` |
| `render.a2ui@1` | one `a2ui-surface/1` value | `a2ui-render-receipt/1` |
| `render.a2ui.app@1` | one `a2ui-app/1` value | `a2ui-app-render-receipt/1` |
| `render.semantic-map@1` | one `semantic-map-envelope/3` value | `semantic-map-render-receipt/1` |
| `render.decision-packet@1` | one public `decision-packet/1` blob | `decision-packet-render-receipt/1` |

This table lists only capabilities that exist on the current branch. Planned or historical capabilities must not be presented as available.

## Source placement

| Responsibility | Path |
|---|---|
| Reusable protocol, domain, projection, renderer, and UI source | `packages/**` |
| Semantic map protocol, reducer, projection, maxGraph renderer and authoring | `packages/semantic-map/**` |
| Browser entrypoint and composition glue | `apps/artifact-shell/index.html` and `apps/artifact-shell/src/**` |
| Additive capability declaration | `apps/artifact-shell/capabilities/<slug>/manifest.json` |
| Thin capability-to-package adapter | `apps/artifact-shell/capabilities/<slug>/engine.mjs` |
| Positive and destructive contract inputs | `apps/artifact-shell/capabilities/<slug>/fixtures/**` |
| Generated shell registry | `apps/artifact-shell/generated/**` |
| Reviewable input/output examples | `examples/<capability-id>/{input,dist}/**` |
| Core package | `packages/core-port/src/**` |
| A2UI adapter artifact producer | `packages/a2ui-adapter-artifacts/**` |
| UI package claims | `packages/ui-claims/**` |
| UI projection evidence | `packages/ui-projection-evidence/**` |
| UI receipts and residuals | `packages/ui-receipts/**` |
| UI gov-package-output producer surface | `.#gov-package-output` |
| Purpose Atlas fixture input | `tests/fixtures/purpose-atlas/**` |
| Purpose Atlas source reference | `tests/reference/purpose-atlas-source/**` |
| SSG hot-refresh viewport fixture | `tests/fixtures/ssg-hot-refresh-viewport/**` |

## Shell boundary

The shell is the browser entrypoint and composition root. It owns only shared glue:

```text
invocation decode
→ capability selection
→ exact engine verification
→ declared host-service injection
→ mount / execute
→ typed result and receipt routing
```

It contains no domain-name switch and no domain semantics. Reusable implementation belongs under `packages/**`; each capability's `engine.mjs` is only the thin adapter between the generic shell and those packages. New capability directories must not require a shell-source change.

See `apps/artifact-shell/README.md` for the executable boundary.

## Generated example dist

Generated output may be committed when it is an explicit, reviewable example under:

```text
examples/<capability-id>/dist/**
```

An example `dist` is non-authoritative and must satisfy all of the following:

- it is generated from the adjacent checked-in `input/**` and current source;
- it is never consumed as source or as a build input;
- CI rebuilds it in a temporary directory and compares the result;
- production publication still belongs to Actions, Release, Pages, or another deployment owner.

Generated previews and receipts outside an explicit example remain build evidence rather than repository authority.

## Naming

Active package names, capability IDs, paths, routes, and release identities use function or contract names. Product nicknames are not active identifiers. Historical Git evidence is not rewritten, but no new source or artifact identity should depend on a retired nickname.

## Authority boundary

Purpose Decision Atlas v6 uses `core+port as lib`.
Runtime input is expected to be `ADRS projected input` produced outside this repo.
A2UI is `a2ui as build`.
JSONL in this repo is `jsonl as attached data`.
Fixtures and examples must be `stateless` and `non-authoritative`.
`ui.git is not a state store`.

## Development-only SSG hot refresh proof

`tests/fixtures/ssg-hot-refresh-viewport` proves that SSG input and compiler changes can replace generated viewer data without replacing the browser page, viewer root, pan, or zoom state.

Manual Wrangler development:

```text
npm run dev:ssg-hot-refresh-proof
```

Real-browser proof:

```text
python3 -m pip install "playwright==1.57.0"
python3 -m playwright install chromium
python3 tests/check-ssg-hot-refresh-viewport.py --server wrangler
CADDY_EXECUTABLE=/path/to/caddy python3 tests/check-ssg-hot-refresh-viewport.py --server caddy
```

Proven servers: Wrangler `4.112.0` and Caddy `v2.11.3`. Both execute the same fixture, builder, revision file, browser poller, viewer, and browser assertion function.

Wrangler owns its custom build watch and static serving in the Wrangler proof. In the Caddy proof, Caddy owns only `file-server` static HTTP delivery; the existing builder runs one Node-built-in watch loop over `content/` and `src/`. Both paths retain the 500 ms browser revision poll and publish revision only after complete generated output.

This is a second server proof, not a second independent product consumer. It is not a claim about every development server, and it does not create a generic server adapter, registry, plugin, package, Caddyfile, production server dependency, or new workflow.

Production-style output contains neither the revision marker, polling client, nor Caddy code. The implementation remains local to `ui` until a second independent repository proves the same transport contract and extraction removes more code than it adds. SSE, WebSocket, Vite, HMR, Service Worker, a new state store, and a new workflow remain outside this proof. CI checks that boundary and publishes the generated screenshots/reports only as non-authoritative evidence.

CI retention is deliberately asymmetric. Complete `npm run check`, the static YAGNI/workflow guards, and the existing adapter builds run on every A2UI workflow execution. The heavy server proofs run only when an exact hot-refresh proof input changes or when `workflow_dispatch` is requested. Unrelated changes skip the Caddy download, both server proofs, and the proof artifact upload.

The heavy proof has no independent workflow or schedule. Missing or unresolvable comparison state fails closed by running it. CI verifies this dev-only capability and its production boundary; CI does not itself provide the development environment.

## Editor to queue to UI boundary

`ui = targetRef emitter + projection reader + preview`.

In the editor-to-queue-to-ui flow, UI emits `ui.targetRef.v1` proposal metadata for local/dev tooling and reads external `repoMap.projection.v1` artifacts produced outside this repo. UI must not write queue rows, accepted ledger rows, admission receipts, or model authority. The detailed boundary is in `docs/editor-to-queue-to-ui-boundary.md`.

The `.#gov-package-output` package uses the governance producer input to expose UI package evidence for upstream join. It is not a final active admission claim, branch-protection cutover, or ADRS meaning source.

## Repo map containment invariant

Repo map projections use this containment invariant:

```text
repo = packages[]
package = models[]
```

The renderer must preserve that invariant visually:

```text
repo rect
  package rect[]
    model rect[]
```

For the svg-pan-zoom spike, `svg-pan-zoom` is allowed only as a camera adapter for pan / zoom / fit. It must not own repo/package/model semantics, containment, dependency relations, LOD policy, font policy, projection, state authority, or generated artifact authority.

## GeoMap canonical UI contract

GeoMap UI changes are accepted only when the CI artifact builds the single canonical property-map UI.

### Source authority

The source authority is:

1. SDUI JSONL
2. shared component registry
3. GeoMapPort runtime boundary
4. data model JSONL

Generated HTML, screenshots, proof reports, and packed artifacts are evidence only. They are not source authority.

### Only visible UI

`property-map-geo-artifact/preview/index.html` is the only visible UI artifact.

The artifact must not expose alternate visual UIs such as:

- `preview/file-open-offline-proof.html`
- `preview/file-open-cdn-fixed.html`
- artifact index pages
- raw JSON `<pre>` previews
- number-marker proof screens

### Required artifact layout

A GeoMap PR must upload `property-map-geo-artifact` containing:

| Required file | Role |
|---|---|
| `dist/a2ui/property-map.surface.v0.9.jsonl` | map-first SDUI surface |
| `dist/a2ui/property-map.data.clear.v0.9.jsonl` | clear state data |
| `dist/a2ui/property-map.data.selected.v0.9.jsonl` | selected state data |
| `dist/registry/shared-component-registry.v1.json` | shared `geoMap` / `atlasStage` registry |
| `runtime/geo-map-port.js` | only allowed map library boundary |
| `preview/index.html` | the single canonical UI |
| `screenshots/clear.svg` | initial visual evidence |
| `screenshots/after-click.svg` | click visual evidence |
| `proof/geomap-proof-report.json` | machine-readable proof |

### Required canonical UI checks

`proof/geomap-proof-report.json` must prove:

| Check | Required value |
|---|---:|
| single visible UI is `preview/index.html` | true |
| no alternate visible proof HTML | true |
| no blank screen | true |
| no `type="module"` in file-open UI | true |
| no relative import in file-open UI | true |
| no CDN dependency in canonical UI | true |
| no raw JSON `<pre>` preview | true |
| map is the main surface | true |
| bottom sheet mode on mobile | true |
| visible map ratio | >= 0.6 |
| sheet does not cover markers | true |
| house marker labels before click | >= 4 |
| property cards in bottom sheet | >= 10 |
| Japanese property names are present | true |
| rent labels are present | true |
| `地図で見る` actions are present | >= 10 |
| selected detail before click | false |
| marker click updates selection | true |
| selected detail after click | true |
| nearby POI markers after click | >= 9 |
| radius overlays after click | >= 1 |
| property-to-POI links after click | >= 9 |
| GeoMapPort is executed | true |
| map library calls remain inside GeoMapPort | true |
| SDUI source contains no map library calls | true |
| screenshots exist | true |

### Non-goals

This contract does not require production live runtime data, GitHub PR/Issue data wiring, or full `@a2ui/web_core` production rendering. Those are later closure items.
