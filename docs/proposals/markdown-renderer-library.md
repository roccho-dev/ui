# Markdown renderer library proposal

## Why

README artifact generation needs a shared renderer so repos do not fork Markdown generation logic.

## Direction

Implement ui-lib as a pure Markdown renderer that consumes `document.model.v1` and optional Markdown template JSONL.

## Decision

The renderer should return Markdown bytes and render diagnostics deterministically. It must not read ADR rows, validate policy, upload artifacts, write repositories, or emit HTML for this path.

## Boundary

ui-lib renders bytes only. Artifact writing and upload belong to each consuming repository CI.

## Merge Gate

The same model, template, and renderer version must produce the same Markdown digest.