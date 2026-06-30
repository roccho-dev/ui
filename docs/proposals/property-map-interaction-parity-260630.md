# Property map interaction parity

## Purpose

Implement interaction parity after the component/view, map visual, and rendered UI gates are in place. The goal is for the A2UI property map to behave like the zip reference for core user actions.

## Dependency

- Depends on #60 component/view parity.
- Depends on #61 GeoMapPort visual parity.
- Depends on #62 rendered UI gate implementation.

## Scope

Add deterministic A2UI state/action behavior for:

- tab switching
- marker click to select property
- table row click to select property
- detail view update
- property filters
- sorting
- JSON apply/reset in debug/data view

## Required actions

- `ui.view.set`
- `property.select`
- `geoMap.marker.click`
- `ui.filter.set`
- `ui.sort.set`
- `ui.data.apply`
- `ui.data.reset`
- `ui.sdui.apply`
- `ui.sdui.reset`

## Required tests

### Tab switching

- click each of 7 tabs
- active tab changes
- expected view components appear
- previous view components no longer dominate the visible area

### Selection

- click marker
- selectedId changes
- detail tab becomes active or detail panel updates
- selected marker visual state changes
- POI/radius/link overlays update

### Table row selection

- open sheet
- click first property row
- selectedId changes
- FocusHero shows clicked property

### Filters and sort

- filter by prefecture
- sort by rank
- sort by rent
- sort by supermarket distance
- `onlyRentOk` changes row count or report explains no-op deterministically
- `onlyMallOk` changes row count or report explains no-op deterministically

### JSON data editor

- edit data JSON
- apply changes
- visible UI updates
- reset restores source seed-derived model

## Required artifact proof

```text
proof/interaction-parity-report.json
screenshots/interaction-tabs.png
screenshots/interaction-filtered.png
screenshots/interaction-detail-after-marker.png
```

## Report status

`proof/interaction-parity-report.json` must have:

```json
{
  "status": "property-map-interaction-parity-pass"
}
```

## Merge criteria

- CI success
- rendered UI gate remains green
- all 7 tabs have click proof
- marker and row selection have proof
- filters/sort have deterministic proof
- JSON apply/reset has proof
- no source authority drift from A2UI files to generated HTML

## Non-goals

- production runtime hardening
- external live data
- pixel-perfect zip matching
