# GeoMap zip rendered UI gate

## Purpose

Open the follow-up PR after #58. #58 defines the A2UI-only zip parity contract. This proposal defines the next gate: CI must render the generated HTML in a browser and fail when the UI is present only as strings, placeholders, or hidden DOM.

## Scope

This PR is a work-order proposal for a rendered UI gate. It does not claim that the production GeoMap UI is complete.

## Source boundary

Source authority remains:

- `packages/a2ui-adapter-artifacts/registry/property-map-component-registry.v2.json`
- `packages/a2ui-adapter-artifacts/a2ui/property-map-zip-parity.surface.v1.jsonl`
- `packages/a2ui-adapter-artifacts/data/property-map-zip-parity.seed.v1.json`
- `packages/a2ui-adapter-artifacts/runtime/geo-map-port.js`

Non-authority remains:

- generated HTML
- screenshots
- proof reports
- uploaded zip visual reference

## Problem to close

#58 can pass with structural proof even when the HTML is visually weak. The next gate must detect these failures:

- property markers rendered as horizontal text rather than absolute-positioned map markers
- missing visible house marker labels
- placeholder SVG used as visual proof
- bottom sheet present but not tested in collapsed/open states
- tabs and table present as strings but not visibly reachable
- detail state not reachable by click
- POI/radius/link overlays not verified after selection

## Required implementation in the next code PR

### 1. Render script

Add:

```text
packages/a2ui-adapter-artifacts/scripts/render-geomap-zip-parity.mjs
```

It must:

1. Build or locate `property-map-zip-parity-artifact/preview/index.html`.
2. Open it in a headless browser.
3. Capture collapsed state.
4. Click `開く`.
5. Capture open state.
6. Click a marker or first table row.
7. Capture detail state.
8. Save screenshots and a report.

Expected outputs:

```text
property-map-zip-parity-artifact/screenshots/rendered-collapsed.png
property-map-zip-parity-artifact/screenshots/rendered-open.png
property-map-zip-parity-artifact/screenshots/rendered-detail.png
property-map-zip-parity-artifact/proof/rendered-ui-report.json
```

### 2. Rendered UI test

Add:

```text
tests/check-geomap-zip-parity-rendered-ui.mjs
```

It must fail unless the generated browser report passes these checks.

### 3. Initial collapsed checks

Required:

- `body[data-proof="zip-a2ui-parity-pass"]`
- `#map` or `.map`
- `.sheet`
- `.sheet.open` is absent initially
- `.sheet-toggle` text is `開く`
- `.head-title` text is `比較`
- `.head-sub` includes `28件`
- `.property-marker` count >= 4
- `.map-label` count >= 4
- map visible height / viewport height >= 0.70
- horizontal text-only marker detection is false

### 4. Open sheet checks

After clicking `開く`, required:

- `.sheet.open`
- `.tab` count == 7
- active tab text == `比較`
- `[data-component="GeneratedHighlights"]`
- `[data-component="CompareControls"]`
- `[data-component="PropertyTable"]`
- table rows >= 28
- visible text includes `ラフォーレASUKA`
- visible text includes `格安レンタカー` or equivalent daily rental-car key summary

### 5. Detail checks

After clicking a marker or row, required:

- active tab text == `詳細`
- `[data-component="FocusHero"]`
- `[data-component="FocusMetrics"]`
- `[data-component="FocusRegionalAccess"]`
- `[data-component="InitialCostPanel"]`
- `[data-component="DecisionPanel"]`
- `[data-component="PoiGrid"]`
- `.dom-poi` count >= 9
- `.dom-radius` count >= 1
- `.dom-link` count >= 9

### 6. Screenshot checks

Required:

- `rendered-collapsed.png` exists
- `rendered-open.png` exists
- `rendered-detail.png` exists
- each file is a real PNG, not SVG placeholder
- each file size is large enough to prove actual rendering, target > 10KB unless the renderer has an explicitly recorded reason
- screenshots are included in `property-map-zip-parity-artifact`

### 7. Report schema

`proof/rendered-ui-report.json` must contain:

```json
{
  "status": "zip-a2ui-rendered-ui-pass",
  "checks": {
    "noJsErrors": true,
    "initialCollapsedSheetPass": true,
    "openSheetPass": true,
    "detailInteractionPass": true,
    "textOnlyMarkerDetected": false,
    "propertyMarkersVisible": 4,
    "mapLabelsVisible": 4,
    "tabsVisibleAfterOpen": 7,
    "propertyRowsVisibleAfterOpen": 28,
    "poiMarkersAfterSelect": 9,
    "radiusAfterSelect": 1,
    "linksAfterSelect": 9,
    "screenshotsGenerated": true
  }
}
```

Counts may be higher than the example values, but not lower than the thresholds.

## CI changes required

Update the A2UI adapter artifact workflow to run, in this order:

1. build zip parity artifact
2. static artifact test
3. render zip parity screenshots
4. rendered UI test
5. upload artifact

The artifact upload must include the PNG screenshots and both proof reports.

## Merge criteria for the implementation PR

- CI success
- `property-map-zip-parity-artifact` uploaded
- generated HTML inspected from CI artifact
- rendered PNG screenshots inspected
- marker is not horizontal text
- house marker labels are visible
- bottom sheet collapsed/open are verified
- detail interaction is verified
- POI/radius/link overlays are verified
- zip counts/tabs/component coverage from #58 remain intact
- zip HTML template is still not source authority

## Non-goals

- pixel-perfect comparison
- production map runtime completion
- live/deploy integration
- external Leaflet CDN guarantee
- replacing A2UI source with the zip HTML template
