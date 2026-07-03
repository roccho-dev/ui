# PR evidence note for ui#96

## Linked issue

Converted from `ui#96`.

## Requirement

Add governance input and expose UI gov-produced package output evidence.

## Delta removed

UI no longer has only legacy local checks as its downstream governance evidence surface. It now has a Nix-visible `gov-package-output` producer surface.

## Evidence

- `flake.nix`
- `.github/workflows/nix-flake-check.yml`
- `ci.intent.v1.jsonl`
- `tests/check-ui-gov-package-output.mjs`
- `docs/phase-e4a-gov-package-output.md`

## Boundary

No final active admission, branch protection cutover, or ADRS meaning authority is claimed.
