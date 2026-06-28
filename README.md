# ui

`ui` owns the A2UI / SDUI component registry and renderer-neutral projection package.

## Current layout

| Responsibility | Path |
|---|---|
| Core package | `packages/core-port/src/**` |
| Purpose Atlas preview package | `packages/purpose-atlas-preview/**` |
| Purpose Atlas fixture input | `tests/fixtures/purpose-atlas/**` |
| Purpose Atlas source reference | `tests/reference/purpose-atlas-source/**` |
| Generated preview/evidence | Nix and CI outputs |

## Boundary

Purpose Decision Atlas v6 uses `core+port as lib`.
Runtime input is expected to be `ADRS projected input` produced outside this repo.
A2UI is `a2ui as build`.
JSONL in this repo is `jsonl as attached data`.
Fixtures must be `stateless` and `non-authoritative`.
`ui.git is not a state store`.

Generated preview HTML, dist assets, evidence receipts, and manifests are build evidence only and are not tracked as repository authority.

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
