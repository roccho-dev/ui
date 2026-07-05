# UI README materialization common adoption for governance #144

## Purpose

Use the governance common README materialization checker for UI instead of adding UI-specific comparison logic.

## Target state

- UI keeps its README artifact producer.
- UI exposes `checks.readme-materialized` through the governance common checker.
- The check emits `readmeMaterializationReceipt.v1` when generated README mode is active.
- UI preview artifacts stay non-authority and do not claim final governance closure.

## Boundary

Draft until roccho-dev/governance#145 lands. This does not replace governance #81 / #131 final README projection enforcement and does not change branch protection.

Refs: roccho-dev/governance#144, roccho-dev/governance#145, roccho-dev/governance#131, roccho-dev/governance#81
