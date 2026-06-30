# Property map zip parity final gate

## Purpose

Finalize the A2UI property-map zip parity work after component/view parity, GeoMapPort visual parity, rendered UI gate, interaction parity, and runtime hardening are complete.

This is the cleanup and final release-gate lane. It must prevent a false completion claim where generated HTML exists but the A2UI source, browser-rendered UI, interactions, or runtime lifecycle are still incomplete.

## Operating state

This proposal can be reviewed before the dependency PRs land, but the final gate must not be treated as implementation closure until every dependency report listed below exists and passes.

Before #60 through #64 land, allowed work is limited to:

- tightening the final artifact layout
- tightening dependency and report contracts
- tightening README/source-boundary language
- listing cleanup rules and negative gates

Before #60 through #64 land, blocked work is:

- claiming final zip parity
- deleting an old proof path without a passing replacement
- accepting placeholder screenshots as visual proof
- accepting string-only or hidden-DOM HTML proof as rendered proof
- merging this lane as final release closure

## Dependency closure

| Input | Required by final gate | Must not claim |
| --- | --- | --- |
| #58 A2UI zip parity CI contract | `proof/zip-visual-parity-report.json` passes, A2UI remains source authority, zip stays oracle only | browser-rendered visual parity |
| #60 component/view parity | registry covers 24/24 zip components, 7/7 views are addressable, `ViewStack` resolves active views | visual/runtime completion |
| #61 GeoMapPort visual parity | property markers, labels, POIs, radius, and links render inside `GeoMapPort` | lifecycle hardening |
| #62 rendered UI gate | browser opens `preview/index.html`, PNGs are produced, rendered report fails hidden/string-only UI | interaction/runtime completion |
| #63 interaction parity | tabs, marker selection, row selection, filters/sort, JSON apply/reset have deterministic proof | production data integration |
| #64 runtime hardening | mount/update/dispose, no duplicate layers, selected overlay replacement, CI tile fallback, stable render counts pass | production map service readiness |
| #65 final gate | obsolete proof paths are removed or downgraded, final artifact layout and README contract are locked | new UI features |

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

## Required report statuses

The final gate must fail unless every report has an explicit pass status.

| Report | Required status | Minimum checks |
| --- | --- | --- |
| `proof/zip-visual-parity-report.json` | `zip-a2ui-parity-pass` | source boundary, zip counts, tab labels, registry coverage, daily rental-car key, Omiya/Kumagaya access |
| `proof/rendered-ui-report.json` | `zip-a2ui-rendered-ui-pass` | real browser render, collapsed/open/detail screenshots, visible markers/labels, no horizontal text-marker fallback |
| `proof/interaction-parity-report.json` | `zip-a2ui-interaction-parity-pass` | 7 tab clicks, marker/row selection, detail update, filter/sort, JSON apply/reset |
| `proof/geomap-runtime-hardening-report.json` | `geomap-runtime-hardening-pass` | mount/update/dispose, no duplicate layers, overlay replacement, fallback tiles, stable marker/POI counts |

## CI gate order

1. Build the A2UI-only source artifact.
2. Run static zip parity checks and write `zip-visual-parity-report.json`.
3. Open `preview/index.html` in a browser.
4. Produce collapsed/open/detail PNG screenshots.
5. Run rendered UI checks and write `rendered-ui-report.json`.
6. Run interaction checks and write `interaction-parity-report.json`.
7. Run GeoMapPort lifecycle checks and write `geomap-runtime-hardening-report.json`.
8. Run final artifact-shape cleanup checks.
9. Upload the final `property-map-zip-parity-artifact`.

## Negative gates

The final gate must fail if any of these are true:

- `preview/index.html` is missing
- more than one visible generated HTML entrypoint exists
- generated HTML is treated as source authority
- zip HTML template is copied into a source-like fixture path
- placeholder SVG screenshots are used as visual proof
- PNG screenshots are missing or zero-byte
- `html.includes(...)` is the only proof for a rendered element
- marker proof can pass while markers are horizontal text outside the map
- key visual nodes are hidden, offscreen, or display-only strings
- report status is missing, unknown, skipped, or non-pass
- proof artifacts are duplicated under competing paths
- obsolete file-open proof HTML remains as a visible proof path
- README claims stronger authority than the artifact proves

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

- #60, #61, #62, #63, and #64 are merged or their implementation-equivalent changes are present on this branch
- CI all green after rebasing onto the latest `proposals`
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
- no obsolete visible HTML artifacts remain
- README states the final contract accurately

## README final contract

README must say:

- A2UI files are source authority
- zip reference is visual/data oracle only
- generated HTML is artifact evidence only
- only visible generated HTML is `preview/index.html`
- browser-rendered PNGs are the visual proof
- merge requires CI success and manual inspection of generated HTML/PNG

## Manual inspection rule

CI can prove that PNGs exist and that DOM checks pass. It cannot prove that the UI is acceptable to humans. Final merge therefore requires a human-readable note in the PR confirming that `preview/index.html`, `rendered-collapsed.png`, `rendered-open.png`, and `rendered-detail.png` were opened and inspected.

## Merge order

Recommended order:

1. #60 component/view parity
2. #61 GeoMapPort visual parity
3. #62 rendered UI gate implementation
4. #64 runtime hardening
5. #63 interaction parity
6. #65 final cleanup/release gate

#64 can progress beside #61, but final #64 closure should wait until #61's visual boundary is stable. #65 remains last.

## Non-goals

- new UI feature work
- live deployment
- production data integration
- pixel-perfect comparison
- changing the source boundary away from A2UI
