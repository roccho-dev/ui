# Atlas composition example

This is the smallest executable **composition witness** for Atlas-shaped UI in `ui`.

It is not the Live Atlas application and does not own Project / Organization / Agent runtime / business meaning. Final application ownership remains `apps` per #321 / roccho-dev/apps#66; this witness stays in `ui`.

## Contract

```text
input/example.jsonl
  -> existing semantic-map builder
  -> current UI Parts / maxGraph adapter
  -> dist/index.html
```

- `input/example.jsonl` is the exact input: **this is what you pass**.
- `dist/index.html` is generated review output: **this is what it draws**.
- `dist/receipt.json` binds the actual input/output bytes by SHA-256 and output byte count.
- `dist/` is generated-only, ignored by Git, and never source authority.
- No Atlas-specific runtime, controller, registry, renderer, server, or state authority is introduced.

## Visible claims

The same input has two existing projections.

### Graph — default

`graph/1` shows:

- nested Atlas / Scope A / Scope B regions;
- generic actor/work/review nodes;
- handoff/work/review relations;
- existing selection, zoom, camera and fit/reset behavior.

### Seq — explicit Pattern switch

Use the existing **Pattern → Seq** control. The two existing ordinal temporal fields project the same Work A / Work B data into existing actor lanes and ordinal sequence positions.

This proves reusable Graph/Seq projection only. It does **not** prove live agent activity, wall-clock telemetry, Control execution, or application authority.

## Build

From the repository root:

```sh
node packages/semantic-map/scripts/build-browser-example.mjs \
  --input=examples/atlas/input/example.jsonl \
  --out=examples/atlas/dist
```

Generated locally:

```text
examples/atlas/dist/
├─ index.html
└─ receipt.json
```

The existing builder packages the current semantic-map browser closure and vendored maxGraph into one HTML file. No example-specific server or renderer is added.

## View

Direct file target:

```text
examples/atlas/dist/index.html
```

The page is a single-file module closure. `file://` is a proof target and must be exercised independently; successful packaging alone is not a `file://` PASS.

Optional shared development host:

```sh
npm run host
```

Default URL:

```text
http://127.0.0.1:18083/examples/atlas/dist/index.html
```

The repository's existing generic static server is shared; this example owns no server.

## Reproducibility

`packages/semantic-map/tests/example_reproducibility.mjs`:

1. builds this exact input twice into owned temporary output directories;
2. checks the existing receipt against the actual input bytes, actual HTML bytes, and byte count;
3. requires byte-identical HTML and equal receipts across repeated generation;
4. removes only expected `index.html` and `receipt.json`, then removes the empty owned directories.

The builder's legacy `receipt.input.path` is not used as the exact Atlas locator. Identity is the actual supplied file plus its receipt hash.

`preview.png` is optional review convenience only; interactive HTML is the proof surface.

## Relations

- Refs #322 — order / Atlas extraction gate; this witness fills the explicit Atlas composition proof
- Refs #328 — composition rule
- Refs #327 — surface rule; Graph/Seq use the existing SVG semantic-map plane
- Refs #321 — final Atlas application ownership is `apps`
- Historical foundation: #330 / #331, adopted into `proposals`
- Related: roccho-dev/apps#66 — application migration handoff; this example remains in `ui`
