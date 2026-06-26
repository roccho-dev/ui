# Seed repo note proposal

## Why

The UI repository needs a small repo-owned note that points back to the accepted records it follows.

## Direction

Add a proposal for a UI-owned seed repo note. The note should identify UI as document model and Markdown renderer surface, not ADR resolver, policy validator, HTML producer for the README path, or artifact lifecycle owner.

## Decision

A later implementation may include a repo-owned note beside the README artifact packet. For UI, the note should say that UI renders from derived document inputs and keeps artifact ownership in the consuming repository.

## Boundary

This proposal is documentation only. It does not change artifact packet shape, CI, branch protection, or runtime behavior.

## Merge Gate

Merge only if UI remains document model and Markdown renderer surface.
