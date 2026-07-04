# UI gov-package-output cutover plan for #98

## Parent

Root parent: roccho-dev/governance#125
Phase parent: roccho-dev/ui#77
Issue: roccho-dev/ui#98

## Status

Blocked. Do not merge this cutover until governance #115 active selected-ref enforcement is accepted.

Green CI on this plan is not merge permission. It only proves the blocked plan is well-formed.

## Purpose

Prepare the UI-local `gov-package-output` evidence-path cutover without changing selected-ref write policy or claiming final governance closure early.

## Scope

This plan records the UI-local cutover boundary, provider-neutral enforcement preconditions, evidence expectations, old-check role mapping, merge blockers, purpose chain, and rollback expectations for #98.

## Provider-neutral preconditions before merge

- governance `gov-final-scope-purpose-join / gate` exists under the final check name.
- governance final gate has same-name green evidence.
- governance #115 has accepted active selected-ref enforcement.
- the selected branch/ref cannot be updated unless the final gate accepts the exact target commit SHA.
- the enforcement point is recorded: GitHub ruleset, self-hosted hook, merge daemon, bot-only merge path, or SSOT publish gate.
- accept proof exists for the exact target SHA after final gate pass.
- reject proof exists for missing gate pass, stale gate output, or digest/SHA mismatch.
- audit receipt records target SHA, gate run/check identity, decision, timestamp, and actor/path.
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
| scope | limit this PR to UI local `gov-package-output` evidence-path cutover planning |
| direct purpose | prevent UI local green from being read as final closure before active selected-ref enforcement accepts the final gate |
| upper purpose | keep downstream UI evidence aligned to `gov-final-scope-purpose-join / gate` and the selected-ref write boundary |
| meta purpose | prevent false-green, authority confusion, human-convention-only approval, and premature pass across downstream repos |
| highest objective | keep UI evidence auditable, transferable, and buyer-readable for high-value company sale review |

## Non-goals

- No branch protection change in this PR.
- No required-check activation in this PR.
- No selected-ref write policy change in this PR.
- No final organization-active claim.
- No governance meaning authority in UI.
- No claim that UI preview artifacts are final governance closure.

## Merge blockers

Do not merge while:

- governance #115 active selected-ref enforcement is incomplete.
- the selected branch/ref can still be manually updated without final gate acceptance.
- accept proof is missing.
- reject proof is missing.
- audit receipt is missing.
- ui packet/check evidence is missing.
- old checks still look like final governance compliance.
- rollback path is missing.

## Evidence expected before ready-for-review

- link to governance final-gate same-name green evidence.
- link to governance #115 accepted active enforcement evidence.
- selected-ref enforcement provider and protected ref name.
- accept proof for exact target SHA.
- reject proof for missing/stale/mismatched gate proof.
- audit receipt format or artifact path.
- ui local check or intent diff.
- local green evidence.
- mapping from old UI checks to final roles.
- explicit rollback text.

## Rollback plan

If UI cutover causes false-positive or false-negative merge behavior after governance #115 completes:

1. remove the UI local required-check cutover from the selected-ref enforcement intent diff;
2. keep `gov-package-output` generation and artifact upload as evidence-only;
3. keep old producer/selftest jobs running under their non-authority roles;
4. reopen #98 if it was closed;
5. record the rollback reason, affected check name, protected ref, and decision receipt in the issue thread.

## Boundary

This document is a blocked cutover plan only. It is not a pass signal and it does not close roccho-dev/governance#125 by itself.
