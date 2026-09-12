# Scroll z repo map proof notes

Refs #112.

This records the discussed proof direction for the repo map UI.

Confirmed:

- Current Atlas is static evidence, not map-like drilldown.
- The user experience should use continuous camera z.
- A reducer should decide visible granularity from z and focus.
- Containment is used for navigation.
- Dependency is shown as an overlay.
- Edges should aggregate when zoomed out and expand when zoomed in.
- Treemap is only the first layout adapter.
- Voronoi can be another layout adapter later.
- A2UI/browser registry remains the rendering boundary.

Next proof should add fixture data, a z projection, a layout adapter, and an overlay adapter while keeping generated preview as evidence only.
