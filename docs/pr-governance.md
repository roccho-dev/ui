# PR governance

This document closes issues #83, #84, #85, #86, #89, #90, and #93 by making PR work issue-led, reviewable, and tied to current facts.

## Purpose line

| generation | purpose |
|---|---|
| highest | High-value company build and eventual sale |
| meta | reduce future review cost and drift |
| repo | keep ui.git small, current, and reviewable |
| operation | every non-trivial PR starts from an issue |

## Issue-first rule

Every non-trivial PR must link a GitHub issue before implementation starts. The issue must state scope, direct purpose, upper purpose, meta purpose, highest objective, completion criteria, non-scope, merge blockers, tests to keep, and tests not to keep.

The reusable issue shape is documented in `docs/scope-to-meta-issue-template.md`.

## PR template

The PR template is `.github/pull_request_template.md`. It requires linked issue, scope, non-scope, direct purpose, upper purpose, meta purpose, highest objective, tests, CI evidence, merge condition, and merge-blocking conditions.

## PR body guard

The current guard is `tests/check-pr-body-governance.mjs`. The workflow `.github/workflows/pr-governance.yml` runs it for pull requests. It checks that a PR body has a linked issue, scope, non-scope, CI or test evidence, merge condition, and explicit human approval wording.

## Current-fact test rule

Tests should check current inputs, generated outputs, and public or upload surfaces. Do not add tests that only remember old names unless a separate issue proves the current contract needs that exact check.

## Current purpose visualization entrypoint

The current purpose visualization path is the core-port projection, not a retired preview package. Reviewers should inspect these current files:

| role | current path |
|---|---|
| surface fixture | `tests/fixtures/purpose-atlas/surface.v0.9.jsonl` |
| data fixture | `tests/fixtures/purpose-atlas/atlas-data.json` |
| data contract | `docs/purpose-atlas-v6-a2ui/A2UI-DATA-CONTRACT.md` |
| semantic check | `tests/check-purpose-atlas.mjs` |
| package entry | `packages/core-port` |

The required meaning is purpose, gap, work_order, receipt, residual, closure object, selected gap, work order, receipt, residual next input, and minimum review actions.

## Human approval gate

For `merge ok?` style questions, answer with draft state, latest head SHA, CI state, linked issue, completion criteria, remaining blockers, and whether explicit human approval exists. Do not merge unless the user explicitly instructs merge after that checklist.
