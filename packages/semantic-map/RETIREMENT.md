# Legacy semantic-map source retirement mapping

The reusable source from legacy semantic-map source commit `1daa001bf780053f4319e3fb20b4ea9a6e0d0442` is carried under this package.

- `packages/**` -> `packages/semantic-map/**` (`packages/app/**` -> `packages/semantic-map/authoring/**`)
- `vendor/maxgraph/**` -> `packages/semantic-map/vendor/maxgraph/**`
- `schemas/**` and maxGraph notices remain beside the package.
- the old standalone route/build shell is replaced by `apps/artifact-shell` + `render.semantic-map@1`; it is not a second source authority.
- old `build.sh`, generated `dist/**`, Wrangler/deploy files and audit/proof outputs are not product source and are intentionally not migrated. Deployment remains a consumer concern.
- `migration-manifest.json` accounts for every migrated reusable source file and its legacy/current digest.

## Intentional source transformations

Four legacy source files change during integration, and no others:

- `packages/app/artifact-module.js`: explicit trusted-authoring frame mode while preserving legacy read-only Artifact Module embedding by default.
- `packages/app/entry.js`: page config selects whether the legacy Artifact Module read-only boundary applies.
- `packages/renderer-maxgraph/adapter.js` and `shapes.js`: relative imports follow the relocated bundled maxGraph vendor directory.

At initial integration, all other mapped reusable legacy source bytes were identical. Later accepted product changes do not rewrite that migration evidence; their hash chain is recorded in `migration-manifest.json#evolutions`.

## Post-integration product evolution

`migration-manifest.json#entries` remains the immutable mapping from legacy source to the initial UI integration. `evolutions` records later product-source changes from that integrated baseline. An evolution must form an exact SHA-256 chain and must not be presented as a legacy migration transform.


## Active-source retirement condition

The legacy standalone working tree is not a runtime, build, test, or publication dependency of this package. The active UI package owns the remaining host integration: accepted DecisionLog and View changes replace the exact mutable inline invocation input, update the parent `#invoke` URL, and preserve the mounted editor. Inputs that the host cannot replace are locked read-only.

Retirement is approved only after the UI repository passes its Artifact Runtime checks and both migrated and shell-level browser proofs with the legacy workspace unavailable. Historical Git objects, the immutable legacy audit summary, and migration digests remain evidence; they are not active source dependencies.
