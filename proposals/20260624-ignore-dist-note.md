# Note: `dist/` is CI artifact only

The static HTML build writes `dist/index.html` and `dist/view-model.json` during CI.

These files are preview artifacts. They are uploaded by GitHub Actions and should not become an authority source for the `ui` repo.
