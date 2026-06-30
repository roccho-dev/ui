# GeoMapPort runtime hardening

## Purpose

Harden GeoMapPort from proof/runtime boundary into a stable production-ready adapter boundary. This lane follows the visual parity work and protects lifecycle, fallback, and performance.

## Dependency

- Depends on #61 GeoMapPort visual parity for final selector-level visual proof.
- This PR now implements the lifecycle/performance proof that can run before final visual parity lands.
- It remains parallel-safe because all map-library calls stay inside `GeoMapPort`.

## Scope

Stabilize the GeoMapPort runtime without making the zip HTML template source authority.

## Required runtime behavior

- deterministic mount
- deterministic update
- deterministic dispose
- no duplicate layers after repeated updates
- no stale selected overlays
- tile fallback for file-open/CI
- optional real Leaflet path isolated behind GeoMapPort
- stable mobile viewport behavior
- stable rendering for 28 property markers
- stable rendering for selected 9+ POIs, radius, and links

## Implemented proof

```text
packages/a2ui-adapter-artifacts/scripts/build-geomap-runtime-hardening.mjs
tests/check-geomap-runtime-hardening.mjs
```

The proof generates:

```text
proof/geomap-runtime-hardening-report.json
```

Expected status:

```json
{
  "status": "geomap-runtime-hardening-pass"
}
```

## Lifecycle tests

### mount

- creates a map exactly once for an idempotent mount
- creates property/POI/overlay layers exactly once per mount
- sets `data-geomap-port`

### update

- repeated update with same data does not duplicate markers
- 10 repeated updates keep DOM node count stable
- selection update replaces POI/radius/link overlays
- 28 property markers remain stable
- selected marker remains visually selected

### dispose

- clears render layers
- removes map instance
- removes event handlers where supported by the map adapter
- can mount again after dispose

## Performance thresholds

- 28 property markers render inside deterministic CI proof
- 9+ POIs render after selection
- 9+ links render after selection
- repeated 10 updates do not grow DOM node count beyond threshold

## Files changed

```text
packages/a2ui-adapter-artifacts/runtime/geo-map-port.js
packages/a2ui-adapter-artifacts/scripts/build-geomap-runtime-hardening.mjs
tests/check-geomap-runtime-hardening.mjs
package.json
```

## Merge criteria

- CI success
- lifecycle report pass
- repeated update no duplicate layers
- dispose/remount pass
- file-open fallback still works
- no map-library calls outside GeoMapPort
- rendered UI gate remains green

## Non-goals

- interaction parity beyond map events
- live data integration
- replacing A2UI source with zip HTML
- pixel-perfect visual comparison
