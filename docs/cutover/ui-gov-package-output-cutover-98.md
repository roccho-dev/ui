# UI gov-package-output cutover plan for #98

## Parent

Root parent: roccho-dev/governance#125
Phase parent: roccho-dev/ui#77
Issue: roccho-dev/ui#98

## Status

Blocked. Do not merge this cutover until governance final-gate cutover is complete.

Green CI on this plan is not merge permission. It only proves the blocked plan is well-formed.

## Purpose

Prepare the UI-local `gov-package-output` required-check cutover without changing branch protection or claiming final governance closure early.

## Scope

This plan records the UI-local cutover boundary, preconditions, evidence expectations, old-check role mapping, merge blockers, purpose chain, and rollback expectations for #98.

## Preconditions before merge

- governance `gov-final-scope-purpose-join / gate` exists under the final check name.
- governance final gate has same-name green evidence.
- governance branch protection or ruleset cutover is complete or explicitly approved.
- ui `gov-package-output` packet/check evidence exists on the target head.
- rollback path is documented.

## Local UI cutover intent

After preconditions are met, UI may treat local `gov-package-output` as the local adoption evidence surface.
Older UI checks must be classified as producer, artifact, selftest, or internal-step roles, not as final governance compliance.

## Old UI check role mapping

| Current UI surface | Final role after governance cutover | Merge authority? | Reason |
|---|---|---:|---|
| `gov-package-output` | local downstream evidence path | local evidence only | proves UI emits joinable packet rows, but governance final gate remains the selected closure authority |
| `Governance package validation` | packet validator / downstream evidence check | no | useful local check, not final selected real closure pass |
| `Nix Flake Check` | tool selftest and package-build evidence | no | proves local build/test health, not selected closure authority |
| `README artifact exporter` | artifact producer | no | exports documentation evidence; artifact output is not final compliance |
| `A2UI adapter artifacts` | artifact producer / renderer evidence | no | proves renderer output, not package closure |
| `PR governance` | PR text and issue-link guard | no | prevents scope drift, but does not prove closure-pass |
| `Purpose visualization artifact` | executable visualization evidence | no | useful human review surface, not governance merge authority |

## Purpose chain

| Generation | UI cutover contribution |
|---|---|
| scope | limit this PR to UI local `gov-package-output` cutover planning |
| direct purpose | prevent UI local green from being read as final closure before governance final gate cutover |
| upper purpose | keep downstream UI evidence aligned to `gov-final-scope-purpose-join / gate` |
| meta purpose | prevent false-green, authority confusion, and premature pass across downstream repos |
| highest objective | keep UI evidence auditable, transferable, and buyer-readable for high-value company sale review |

## Non-goals

- No branch protection change in this PR.
- No required-check activation in this PR.
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

## Rollback plan

If UI cutover causes false-positive or false-negative merge behavior after governance #115 completes:

1. remove the UI local required-check cutover from the ruleset or intent diff;
2. keep `gov-package-output` generation and artifact upload as evidence-only;
3. keep old producer/selftest jobs running under their non-authority roles;
4. reopen #98 if it was closed;
5. record the rollback reason and the affected check name in the issue thread.

## Boundary

This document is a blocked cutover plan only. It is not a pass signal and it does not close roccho-dev/governance#125 by itself.
