# Repo-map external input artifact

Refs: #118

## Purpose

The repo-map artifact builder can render either the built-in fixture or an externally supplied repo-map input.

## Input priority

```text
CLI input
  -> env input
  -> built-in fixture fallback
```

## Accepted input forms

| input | Role |
|---|---|
| `repoMap` world JSONL | external read-model input |
| `repoMap` projection JSON | renderer-ready read-model input |
| legacy `map.*` JSONL | compatibility input |

## Boundary

Generated HTML, screenshots, manifests, and bundled source copies are evidence only.

```text
generatedArtifactsAreAuthority = false
ui.git is not a state store
```

The source copy under the artifact `source/` directory is bundled evidence for reproducibility, not accepted ledger authority.
