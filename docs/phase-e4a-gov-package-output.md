# UI gov-package-output adoption boundary

This document records the Phase E4a boundary for `ui#96`.

## Purpose

Adopt the governance producer input and expose `.#gov-package-output` as a non-authority UI evidence packet.

## Evidence surfaces

- `flake.nix` imports `roccho-dev/governance/proposals` as a producer input.
- `.#gov-package-output` builds the packet through `nix/gov-package-output-producer.nix`.
- `checks.<system>.gov-package-output` verifies the packet file set and producer provenance surface.
- `.github/workflows/nix-flake-check.yml` uploads `ui-gov-package-output` as evidence.
- `tests/check-ui-gov-package-output.mjs` validates the local contract.

## Boundary

This is producer evidence only. It does not claim final org active admission, downstream universe cutover, branch protection, or ADRS meaning authority.
