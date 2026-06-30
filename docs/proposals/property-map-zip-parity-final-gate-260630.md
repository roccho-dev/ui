# Property map zip parity final gate

## Purpose

Finalize the A2UI property-map zip parity work after component/view parity, GeoMapPort visual parity, rendered UI gate, interaction parity, and runtime hardening are complete.

This is the cleanup and final release-gate lane.

## Dependency

Depends on:

- #60 component/view parity
- #61 GeoMapPort visual parity
- #62 rendered UI gate implementation
- #63 interaction parity
- #64 runtime hardening

## Scope

Remove obsolete proof paths and lock the final artifact contract.

## Required final artifact

```text
property-map-zip-parity-artifact/
  preview/index.html
  screenshots/rendered-collapsed.png
  screenshots/rendered-open.png
  screenshots/rendered-detail.png
  proof/zip-visual-parity-report.json
  proof/rendered-ui-report.json
  proof/interaction-parity-report.json
  proof/geomap-runtime-hardening-report.json
  dist/a2ui/property-map-zip-parity.surface.v1.jsonl
  dist/data/property-map-zip-parity.seed.v1.json
  dist/data/property-map-zip-parity.data.v1.json
  dist/registry/property-map-component-registry.v2.json
  runtime/geo-map-port.js
  reference/zip-visual-oracle/visual-contract.json
```

## Required cleanup

Remove or downgrade to non-gating evidence:

- placeholder SVG screenshots
- string-only HTML proof
- weak `html.includes(...)` gates as sole proof
- obsolete file-open proof HTML
- duplicated proof artifacts
- zip HTML template as source-like fixture
- any artifact path that implies generated HTML is source authority

## Final merge gates

- CI all green
- generated HTML exists and is artifact-only
- rendered PNG screenshots exist and have been inspected
- static zip parity report passes
- rendered UI report passes
- interaction parity report passes
- runtime hardening report passes
- zip counts/tabs/component coverage remain intact
- house markers and labels are visible
- bottom sheet collapsed/open is verified
- detail interaction is verified
- POI/radius/link overlays are verified
- no obsolete visible HTML artifacts
- README states the final contract accurately

## README final contract

README must say:

- A2UI files are source authority
- zip reference is visual/data oracle only
- generated HTML is artifact evidence only
- only visible generated HTML is `preview/index.html`
- browser-rendered PNGs are the visual proof
- merge requires CI success and manual inspection of generated HTML/PNG

## Non-goals

- new UI feature work
- live deployment
- production data integration
- pixel-perfect comparison
- changing the source boundary away from A2UI
