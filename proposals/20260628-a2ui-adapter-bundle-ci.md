# A2UI adapter artifact CI for live and purpose

## Purpose

Add the post-#38 adapter proof lane that keeps `core+port as lib for A2UI` shared while allowing requirement-specific adapters to generate reviewable CI evidence artifacts.

This PR aligns with #39 as the expectation ledger. It does not replace #39 and does not make the UI repository an ADRS or governance authority.

## Change

- Add `packages/a2ui-adapter-artifacts/**` as a self-contained adapter evidence package.
- Add `live` and `purpose` requirement packs, adapters, policies, negative fixtures, and proof scripts.
- Generate live and purpose A2UI surface/data-model/preview/proof outputs in CI only.
- Add a Node-based adapter artifact workflow that generates evidence bundles and uploads them.
- Add GitHub Actions upload for:
  - `live-adapter-artifact`
  - `purpose-adapter-artifact`
  - `adapter-artifact-index`

## Boundary

- The shared registry is a capability contract, not a product requirement store.
- Requirement packs are adapter inputs.
- Adapters are thin maps from requirement/data/surface inputs to A2UI messages and DataModel.
- Generated `dist`, `preview`, proof reports, and artifact bundles are CI evidence and are not tracked source.
- Purpose uses the #38 `A2uiSduiSurface + atlasStage` boundary; it does not replace the atlas graph renderer.
- Live uses the same registry with live-specific ports.

## Verification target

- `npm run ci:adapters`
- `node tests/check-a2ui-adapter-artifacts.mjs`
- `nix flake check`
- GitHub Actions uploads all three adapter artifacts.

## Relationship to #39

#39 records the expectation ledger. This PR implements the adapter CI evidence/proof part of that ledger without taking ADRS/governance authority.
