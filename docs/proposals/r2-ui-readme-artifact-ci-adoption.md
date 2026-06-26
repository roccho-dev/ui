# R2 ui README artifact CI adoption

## Why

ui should prove its own README artifact packet through repo-owned CI without becoming an artifact lifecycle owner for other repositories.

## Direction

Add a ui-local README artifact builder, Nix package/check, and declared artifact exporter workflow.

## Decision

`ui` owns document model and Markdown rendering. `ui` repo CI owns its own README artifact packet. The packet is non-authority evidence and must include `README.md`, `manifest.json`, `sources.jsonl`, and `receipt.json`.

## Boundary

- ui-lib renders Markdown bytes.
- ui-lib does not resolve ADR authority.
- ui-lib does not own downstream artifact lifecycle.
- README artifact upload is repo CI evidence.

## Merge Gate

- `nix flake check` passes.
- `nix build .#readme-artifact` emits the four required files.
- `.github/workflows/readme-artifact.yml` succeeds and uploads the packet.
- `ci.intent.v1.jsonl` declares the artifact exporter as non-authority and `source=nix-output`.
