# Localhost repo-map hot-reload preview

Refs: #121

## Purpose

Local/dev tooling can regenerate a repo-map projection and see the browser preview reload without making ui.git a state store.

## Command shape

```text
node packages/a2ui-adapter-artifacts/scripts/watch-repo-map-svgpanzoom.mjs \
  --input-jsonl path/to/repo-map.jsonl \
  --out adapter-result/repo-map-svgpanzoom-hot-reload
```

`--once` builds the localhost preview artifact and proof without starting the server.

## Boundary

```text
external projection file
  -> local watcher
  -> generated preview redraw
  -> non-authority proof
```

The local server is for localhost development only. Production artifact mode remains separate. Generated HTML and hot-reload receipts remain evidence only.

```text
generatedArtifactsAreAuthority = false
```
