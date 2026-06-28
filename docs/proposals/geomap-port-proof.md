# GeoMapPort proof

This proposal adds a map-first property surface on a clean proposals base.

Boundary:
- SDUI owns layout and sheet placement.
- Shared registry owns geoMap and atlasStage ports.
- Map library calls stay inside GeoMapPort.
- CI uploads property-map-geo-artifact as generated evidence.
