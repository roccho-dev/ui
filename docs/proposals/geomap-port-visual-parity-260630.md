# GeoMapPort visual parity

## Purpose

Implement the map visual lane for zip-to-A2UI parity. The goal is to make property markers, labels, POIs, radius, and links render as map overlay UI through the GeoMapPort boundary.

## Dependency

- Depends on #58 A2UI zip parity contract.
- Can proceed in parallel with A2UI component/view parity and rendered UI gate work.

## Scope

The implementation PR must keep all map-library calls inside `GeoMapPort` and must not move Leaflet/mock-map calls into the A2UI surface or data layer.

## Required UI behavior

- Map fallback visible without external network.
- Property markers are absolute-positioned DOM overlays.
- Markers use house icon `🏠`.
- Marker labels show property name and rent.
- Selected property has a selected visual state.
- Selecting a property renders POI markers.
- Selecting a property renders a radius circle.
- Selecting a property renders property-to-POI links.
- Marker click dispatches selection back to A2UI state.

## Failure modes CI must catch

- markers rendered as horizontal text
- labels missing
- marker nodes outside map area
- selected property not visually distinct
- no POI markers after selection
- no radius after selection
- no links after selection
- map library calls outside GeoMapPort

## Files to change in implementation follow-up

```text
packages/a2ui-adapter-artifacts/runtime/geo-map-port.js
packages/a2ui-adapter-artifacts/scripts/build-geomap-zip-parity.mjs
tests/check-geomap-zip-parity-artifact.mjs
tests/check-geomap-zip-parity-rendered-ui.mjs
```

## Required selectors

- `.property-marker`
- `.property-core`
- `.map-label`
- `.selected`
- `.dom-poi`
- `.dom-radius`
- `.dom-link`

## Required thresholds

- initial `.property-marker` count >= 4
- initial `.map-label` count >= 4
- after selection `.dom-poi` count >= 9
- after selection `.dom-radius` count >= 1
- after selection `.dom-link` count >= 9
- text-only marker detection is false

## Merge criteria

- CI success
- map visual proof in artifact
- rendered UI gate, once available, can confirm marker/label visibility
- GeoMapPort remains the only map rendering boundary
- zip HTML template remains non-authority

## Non-goals

- full production map hardening
- external Leaflet CDN guarantee
- tab/filter/JSON interaction parity
- pixel-perfect map tile comparison
