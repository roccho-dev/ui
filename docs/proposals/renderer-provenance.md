# Renderer provenance proposal

## Why

Rendered Markdown must be traceable to model, template, and renderer versions.

## Direction

Add renderer provenance output for Markdown rendering.

## Decision

ui-lib should return renderer version, renderer digest, template digest, model digest, output digest, and render options digest beside Markdown bytes.

## Boundary

Renderer provenance proves rendering inputs and outputs. It does not prove ADR acceptance, governance policy, or artifact upload.

## Merge Gate

Implementation must include provenance fields required by repo artifact manifests.