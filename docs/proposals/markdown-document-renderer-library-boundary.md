# Markdown document renderer library boundary proposal

## Why

README artifact rendering should reuse UI/document-surface ideas without turning `ui` into an ADR authority resolver, governance policy checker, artifact owner, or HTML renderer. The goal is to make `ui` a reusable library for document model and Markdown rendering only, so each consuming repository can generate its own README artifact without forking rendering logic.

## Direction

Adopt `ui-lib` as a pure document model and Markdown surface renderer library. It consumes an already-resolved document model, plus a Markdown template JSONL if needed, and returns Markdown bytes with deterministic diagnostics. It must not read raw ADR rows, resolve accepted decisions, validate governance policy, upload artifacts, or produce HTML.

## Decision

`ui` should provide the Markdown document renderer boundary before implementation. This proposal does not implement the renderer. It fixes the expected responsibilities, input/output shape, forbidden paths, negative fixtures, and merge gates for the later implementation proposal.

## Boundary

| Area | Decision |
|---|---|
| `ui as lib` | YES |
| ADR authority resolver | NO |
| policy validator | NO |
| document model owner | YES |
| Markdown template JSONL interpreter | YES |
| Markdown bytes renderer | YES |
| artifact lifecycle owner | NO |
| GitHub artifact upload | NO |
| HTML output | NO |
| repository mutation | NO |

Allowed responsibilities:

- define a renderer-neutral document model for README-like artifacts;
- interpret Markdown template JSONL;
- render Markdown bytes deterministically;
- report render diagnostics deterministically;
- keep rendering independent of ADR authority and governance policy decisions.

Forbidden responsibilities:

- read raw ADR rows to decide README meaning;
- resolve accepted ADR decisions;
- decide required README sections;
- validate governance policy;
- upload or own artifacts;
- write to downstream repositories;
- emit HTML output for README artifact work;
- treat UI records as approval, merge, fire, or canonical business state.

## Input contract

Minimum inputs for `ui-lib`:

| Input | Meaning |
|---|---|
| `document.model.v1` | already-resolved document model from a trusted upstream such as `gov-lib` |
| `md.template.jsonl` | optional Markdown block template records |
| renderer version | renderer implementation/version digest |
| render options | explicit options only, no implicit repository reads |

`ui-lib` may consume an ADR-derived document model, but it must not know or decide whether the model came from raw ADR, accepted ADR, or another authority system. That resolution belongs upstream.

## Output contract

Minimum outputs from `ui-lib`:

| Output | Meaning |
|---|---|
| Markdown bytes | the rendered `README.md` body |
| render diagnostics | deterministic errors/warnings for unknown block, unsafe content, or unsupported field |
| renderer provenance | renderer version, template digest, model digest |

The consuming repository CI owns writing the bytes to `README.md`, writing manifest/receipt files, and uploading artifacts.

## Side-effect policy

Initial implementation should be pure. Prefer stdout or returned bytes only.

If a CLI is later needed, `ui-cli --out DIR` may be proposed separately and limited to local filesystem writes. Upload, commit, PR creation, repository mutation, runtime execution, or GitHub artifact operation must remain outside `ui`.

## Negative fixtures to add later

- `ui-lib` reads raw ADR rows;
- `ui-lib` decides required sections;
- `ui-lib` validates policy;
- `ui-lib` emits HTML;
- `ui-lib` uploads an artifact;
- `ui-lib` accepts authority fields in document model;
- same input produces different Markdown digest;
- unknown block is silently dropped;
- unsafe Markdown injection is accepted without diagnostic.

## Proof

This proposal follows ADR `doc://adrs/readme-artifact-library-boundaries` from adrs #64. It preserves the existing UI boundary: UI owns renderer-neutral projection and component/document surface mechanics, not ADR/domain/business/approval authority or runtime hosting.

## Change Summary

- Add a proposal document for Markdown document renderer library boundaries.
- Define input/output contracts for later implementation.
- Define side-effect policy for pure library first and optional CLI later.
- Explicitly forbid ADR resolution, policy validation, HTML output, and artifact ownership.

## Merge Gate

Merge only if the existing UI CI passes. Later implementation PRs should add tests and negative fixtures against this proposal before adding renderer code.
