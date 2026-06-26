# Render checks proposal

## Why

Markdown rendering should surface unsupported or unsafe input deterministically.

## Direction

Add render-time checks for unknown blocks, missing fields, unsafe content, unsupported table shapes, and unstable ordering.

## Decision

ui-lib should emit structured render findings with code, severity, target, and renderer provenance.

## Boundary

Render checks are not governance policy checks and do not decide required README sections.

## Merge Gate

Implementation must not silently drop unknown blocks or unsafe content.