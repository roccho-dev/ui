# Repo-map targetRef bridge

Refs: #120

## Purpose

Selectable repo-map nodes and edges expose target metadata for local/dev tooling such as Vim/hq modeling commands.

## Mapping

| UI target | targetKind |
|---|---|
| repo node | `projectionNode` |
| package node | `projectionNode` |
| model node | `projectionNode` |
| dependency edge | `relation` |
| component | `component` |

## Boundary

`ui.targetRef.v1` records are proposal targets only.

```text
UI selection -> targetRef -> local bridge / queue proposal
```

They do not approve, merge, fire commands, or write accepted ledger state.
