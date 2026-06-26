# Local CLI proposal

## Why

A command-line wrapper may help consuming repo CI call ui-lib without giving ui-lib remote side effects.

## Direction

Add an optional local CLI only after the pure renderer library boundary is implemented.

## Decision

The CLI may read explicit local input files and write Markdown/provenance to stdout or a local output directory. It must not upload artifacts, commit files, create pull requests, mutate repositories, or perform runtime operations.

## Boundary

The CLI is a local adapter for ui-lib. Artifact ownership remains in the consuming repository CI.

## Merge Gate

Implementation must prove local-only behavior and deterministic output.