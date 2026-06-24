# Acceptance gates

This proposal is mergeable only when the following are true:

- The branch is based on `main`.
- `npm test` runs before the build.
- `npm run build:html` writes `dist/index.html` and `dist/view-model.json`.
- CI verifies both files are non-empty.
- CI uploads `dist/` as `ui-built-html`.
- Generated HTML remains non-authority preview output.
