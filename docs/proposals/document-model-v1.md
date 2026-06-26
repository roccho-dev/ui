# document.model.v1 proposal

## Why

ui-lib should render already-resolved document data without reading ADR rows or validating governance policy.

## Direction

Define a renderer-neutral `document.model.v1` for README-like Markdown artifacts.

## Decision

The model should contain document id, audience, sections, block types, text, lists, key-value rows, provenance refs, and model digest. It must not contain authority decisions or policy evaluation logic.

## Boundary

ui-lib owns document model shape for rendering. gov-lib owns semantic projection and policy checks. Each repo owns artifact upload.

## Merge Gate

Implementation must reject authority fields and must not read repositories or ADR sources implicitly.