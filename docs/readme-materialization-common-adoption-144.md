# UI README materialization common adoption for governance #144

## Purpose

Use the governance common README materialization checker for UI instead of adding UI-specific comparison logic.

## Implemented delta

- UI keeps `.#readme-artifact` as a repo-local non-authority README artifact producer.
- UI imports `roccho-dev/governance:nix/readme-materialization-checks.nix`.
- UI exposes `checks.readme-materialized` through the governance common checker.
- The common check emits `readmeMaterializationReceipt.v1` when the generated README artifact and committed `README.md` are byte-identical.
- `docs/readme-materialization/README.source.md` is the local source for the generated README artifact until final ADRS README projection enforcement replaces or narrows this surface.

## Verification surface

`nix flake check` is expected to build `checks.readme-materialized`; that output is the local receipt-producing proof for this PR.

## Boundary

This is local README materialization evidence only. It does not replace governance #81 / #131 final README projection enforcement, does not mutate branch protection, and does not claim final governance closure.

Refs: roccho-dev/governance#144, roccho-dev/governance#145, roccho-dev/governance#131, roccho-dev/governance#81
