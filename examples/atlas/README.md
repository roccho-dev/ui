# Atlas composition example

This is the smallest executable **composition proof** for Atlas-shaped UI in `ui`.

It is not the Live Atlas application and does not own Project / Organization / Agent runtime / business meaning. The application remains temporary in `ui` until the extraction flow in #322 completes, then moves under `apps` per #321 / apps#66.

## Contract

```text
input/example.jsonl
  -> current semantic-map UI Parts / maxGraph adapter
  -> dist/index.html
```

- `input/example.jsonl` is the exact input: **this is what you pass**.
- `dist/index.html` is generated review output: **this is what it draws**.
- The example proves only composition of existing generic pieces: nested scopes, nodes, relations, temporal metadata, camera/fit-capable SVG rendering.
- It introduces no Atlas-specific runtime, controller, registry, renderer, or state authority.

## Build

From the repository root:

```sh
node packages/semantic-map/scripts/build-browser-example.mjs \
  --input=examples/atlas/input/example.jsonl \
  --out=examples/atlas/dist
```

The existing builder packages the current semantic-map browser closure and vendored maxGraph into one HTML file. No example-specific server or renderer is added.

## View

Direct file:

```text
examples/atlas/dist/index.html
```

The generated HTML is self-contained and intended to be reviewable with `file://`.

Optional shared development host:

```sh
npm run host
```

Then open:

```text
http://127.0.0.1:18083/examples/atlas/dist/index.html
```

The host is the repository's existing generic static server; this example does not own a server.

## Reproducibility

`packages/semantic-map/tests/example_reproducibility.mjs` builds this exact JSONL into a temporary directory and requires a successful `semantic-map-example-build/1` receipt plus a non-empty `dist/index.html`.

`dist/` is generated output and is not source authority. `preview.png` is intentionally not required: a bitmap cannot prove zoom, selection, camera, or other browser behavior. A screenshot may be added later only as a review convenience.

## Relations

- Refs #322 — order / Atlas extraction gate; Phase 4 requires exact input -> visible output
- Refs #328 — composition rule
- Refs #327 — surface rule; this witness uses the existing SVG semantic-map plane
- Refs #321 — final Atlas application ownership is `apps`
- Depends on #331 — this PR is stacked on the exact #331 candidate so the witness is tested against that UI foundation
- Related: roccho-dev/apps#66 — application migration handoff; this example stays in `ui`
