# Retirement governance audit 260703

This document closes the audit side of #80, #81, #82, #87, #88, #91, and #92.

## #78 post-merge fact

| item | fact |
|---|---|
| PR | #78 Remove residual Purpose Atlas preview package |
| state | merged |
| merged_at | 2026-07-02T19:57:14Z |
| merge_commit | 871e809a5e114c94b49631880a1b20607527d9eb |
| head | d4b6e4334ee6f31d100dda8e32bf81a37fc002f0 |

#78 is no longer draft and is already merged. Its stated scope was physical removal of `packages/purpose-atlas-preview`, removal of stale preview artifact checking, and keeping current-fact absence and semantic checks.

## Default branch current-state checks

| check | current fact |
|---|---|
| package workspace | `package.json` exposes `packages/core-port` only |
| retired preview package | `tests/check-purpose-atlas.mjs` asserts `packages/purpose-atlas-preview` is absent |
| retired Nix output | `tests/check-purpose-atlas.mjs` asserts `purpose-atlas-preview-html` and `mkPurposeAtlasPreview` are absent from `flake.nix` |
| current surface | `tests/fixtures/purpose-atlas/surface.v0.9.jsonl` must expose `purpose-atlas`, `A2uiSduiSurface`, closure text, and review actions |
| current data | `tests/fixtures/purpose-atlas/atlas-data.json` must include purpose, gap, work_order, receipt, and residual kinds |
| current marker cleanup | `tests/check-purpose-atlas.mjs` rejects `retirement_state`, `false_positive_guard`, and `future-retirement` in current data |
| run-all coverage | `tests/run-all.mjs` imports `check-purpose-atlas.mjs` |

## #75 #76 #78 chain review

| PR | current state | judgment |
|---:|---|---|
| #75 | open, not merged, mergeable false | still needs separate decision; do not treat as completed by #78 |
| #76 | merged | goal-state retirement contract is present |
| #78 | merged | residual preview package physical deletion is complete |

The chain is partly closed. The preview package retirement side is closed by #76 and #78. The false-positive purpose adapter artifact side is not closed because #75 remains open.

## Current open PR audit

| PR | title | state | mergeability | worker judgment |
|---:|---|---|---|---|
| #75 | Retire false-positive purpose adapter artifact | open | false | rebase or replace before merge; keep issue-led review |
| #34 | Move Purpose Atlas preview into package boundary | open | true | stale with retired preview direction; close or retarget only if a current issue proves need |

## Recent merged PR review

| PR | state | merge-quality note |
|---:|---|---|
| #76 | merged | completion was stronger than a future marker: it framed one current purpose visualization path and rejected parallel retired UI |
| #78 | merged | merge occurred after explicit human instruction; body included no automatic merge condition and physical deletion criteria |

## Residuals

| residual | handling |
|---|---|
| #75 still open | not closed by this audit; requires its own rebase, replacement, or closure decision |
| #34 still open | stale and potentially contradictory to current preview retirement; should not be merged as-is |
| post-merge CI run ids | not recorded in this doc because this worker did not fetch run ids for the merge commit in the repository UI |

## Closure statement

The audit issues can close only as audit work, not as proof that all older PR work is complete. The current default branch has a current-purpose projection check and physical preview package absence check. The remaining action is operational: decide #75 and #34 separately under issue-first governance.
