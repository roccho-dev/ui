# Proposal: build static HTML in CI from `main`

## Purpose

Make `ui` produce a reviewable built HTML artifact from CI while keeping the generated HTML non-authority.

## Base branch decision

This proposal is based on `main`.

Reason: `main` already contains the current accepted code path for the UI model, including the mention/a11y loop. The previous PR branch was based on `claude/ui-modeling-corr-port-260618`, which is behind `main`, so retargeting that branch directly would keep stale ancestry.

## Scope

- Add `scripts/build-html.mjs`.
- Add `npm run build:html`.
- Add GitHub Actions workflow `Build HTML`.
- Upload `dist/` as artifact `ui-built-html`.

## Non-scope

- Do not make generated HTML an authority source.
- Do not add runtime hosting.
- Do not change approval, merge, or fire boundaries.

## Acceptance

- `npm test` passes.
- `npm run build:html` writes `dist/index.html` and `dist/view-model.json`.
- CI verifies the files and uploads `ui-built-html`.
