# UI gov-package-output cutover plan for #98

## Parent

Root parent: roccho-dev/governance#125
Phase parent: roccho-dev/ui#77
Issue: roccho-dev/ui#98

## Status

Blocked. Do not merge this cutover until governance final-gate cutover is complete.

## Purpose

Prepare the UI-local `gov-package-output` required-check cutover without changing branch protection or claiming final governance closure early.

## Preconditions before merge

- governance `gov-final-scope-purpose-join / gate` exists under the final check name.
- governance final gate has same-name green evidence.
- governance branch protection or ruleset cutover is complete or explicitly approved.
- ui `gov-package-output` packet/check evidence exists on the target head.
- rollback path is documented.

## Local UI cutover intent

After preconditions are met, UI may treat local `gov-package-output` as the local adoption evidence surface.
Older UI checks must be classified as producer, artifact, selftest, or internal-step roles, not as final governance compliance.

## Non-goals

- No branch protection change in this PR.
- No final organization-active claim.
- No governance meaning authority in UI.
- No claim that UI preview artifacts are final governance closure.

## Merge blockers

Do not merge while:

- governance final-gate cutover is incomplete.
- ui packet/check evidence is missing.
- old checks still look like final governance compliance.
- rollback path is missing.

## Evidence expected before ready-for-review

- link to governance final-gate same-name green evidence.
- ui local check or intent diff.
- local green evidence.
- mapping from old UI checks to final roles.
- explicit rollback text.

## Boundary

This document is a blocked cutover plan only. It is not a pass signal and it does not close roccho-dev/governance#125 by itself.
