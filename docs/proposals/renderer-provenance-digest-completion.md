# Renderer provenance digest completion

## Why

The Markdown renderer implementation needs explicit renderer and render option digests so downstream README artifact manifests can trace rendering inputs without making ui-lib an artifact owner.

## Scope

Complete the renderer provenance requirement by adding `rendererDigest` and `renderOptionsDigest` to the Markdown render result.

## Boundary

This keeps ui-lib limited to document model and Markdown rendering. It does not add ADR resolution, policy validation, artifact upload, repository mutation, or remote side effects.

## Gate

The renderer check must prove both new digest fields are stable and that render option changes are traceable.
