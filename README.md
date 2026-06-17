# ui

`ui` owns UI modeling contracts and the core/port library boundary.

This proposal keeps runtime ingress out of this repo. Collectors, Caddy, and
durable process supervision belong to operational repos. `ui` accepts raw
JSONL records as input and produces renderer-neutral UI projections.

## Scope

- `jsonl.record.generic.v1` envelope helpers.
- UI correlation/modeling functions that project raw records into view models.
- Port contracts for raw input and projection output.
- Adapter boxes for future HTML, CLI, and TUI surfaces.

## Non-Scope

- HTTP collectors.
- Caddy configuration.
- Browser-only renderer ownership.
- Canonical business state.

## Current Library

`ui-modeling-corr-port` is a stdlib-only Node package.

```sh
npm test
node tests/check-ui-modeling.mjs
```

The primary exported projection is:

```js
projectNeedZoomSurface(records)
```

It transforms append-only raw envelopes into:

```json
{
  "kind": "need_zoom.voronoi_surface.v1",
  "surface": {},
  "facets": [],
  "nodes": [],
  "edges": [],
  "visibleNodeIds": [],
  "events": [],
  "received": {},
  "pool": {}
}
```

## Adapter Boxes

Adapters are descriptors only. They declare what a host may mount later; they
do not own renderer state.

- `htmlBox`
- `cssBox`
- `jsBox`
- future `cliBox`
- future `tuiBox`
