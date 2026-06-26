# Markdown template JSONL proposal

## Why

README rendering needs deterministic layout without embedding ADR or governance semantics in the renderer.

## Direction

Define a small Markdown template JSONL format for block ordering and field placement.

## Decision

Template records may describe headings, paragraphs, quotes, lists, key-value rows, tables, and provenance blocks. HTML output is out of scope.

## Boundary

Templates control Markdown layout only. They do not decide required sections, policy, authority, artifact lifecycle, or source selection.

## Merge Gate

Implementation must fail on unsupported blocks or unsafe content rather than silently dropping them.