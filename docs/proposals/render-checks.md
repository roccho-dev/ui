# Render checks proposal

## Scope Purpose

Render checks make Markdown rendering failures explicit before a README artifact can be trusted by repo CI.

This keeps ui-lib inside the renderer boundary: it validates renderability of `document.model.v1` and Markdown template input, but it does not decide ADR acceptance, governance policy, required README sections, or artifact lifecycle.

The purpose is to prevent silent loss, unsafe Markdown, and nondeterministic output so the same renderer can be reused across repos with low review cost.

## Why

Markdown rendering should surface unsupported or unsafe input deterministically.

## Direction

Add render-time checks for unknown blocks, missing fields, unsafe content, unsupported table shapes, and unstable ordering.

Each finding should include code, severity, target, message, and renderer provenance fields needed by downstream artifact manifests.

## Decision

ui-lib should emit structured render findings with code, severity, target, message, and renderer provenance.

Findings are renderer findings, not policy findings. They only describe whether the supplied document model and template can be rendered safely and deterministically as Markdown.

## Boundary

Render checks are not governance policy checks and do not decide required README sections.

Render checks must not read raw ADR rows, resolve authority, validate policy, upload artifacts, write repositories, or emit HTML for this Markdown renderer path.

## Merge Gate

Implementation must not silently drop or accept any of these cases:

- unknown block
- missing required field
- unsafe content
- unsupported table shape
- unstable ordering

Each case must produce a structured render finding for the intended reason, and repeated runs over the same model, template, and renderer version must produce the same finding set and digest.
