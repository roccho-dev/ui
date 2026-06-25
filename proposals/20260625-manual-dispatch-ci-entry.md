# Proposal: Manual CI entrypoint

## Why

Keep `ui` replayable from the GitHub Actions surface without restoring closed preview/build proposals.

## Decision

`ui` already satisfies the repository manual baseline CI entrypoint through default-branch workflows:

- `.github/workflows/nix-flake-check.yml`
- `.github/workflows/purpose-atlas-preview.yml`

The closed `Build HTML` workflow remains out of scope until a separate proposal proves that generated HTML artifacts should be restored.

## Boundary

Manual CI replay is evidence only. CI green, artifacts, receipts, and PR state are not Accepted authority.
