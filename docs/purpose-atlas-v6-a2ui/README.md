# Purpose Atlas A2UI witness boundary

Purpose Decision Atlas v6 is a non-authority A2UI witness.

Atlasの価値はUIそのものではなく、目的・責任・gap・work・receipt・関係・履歴という共通の意味を、人とagentが同じように読み、用途ごとにprojectionできること。意味の正本自体はAtlas/UIに置かない。

| Responsibility | Path |
|---|---|
| Preview package | `packages/purpose-atlas-preview/**` |
| A2UI shell fixture | `tests/fixtures/purpose-atlas/surface.v0.9.jsonl` |
| Attached data fixture | `tests/fixtures/purpose-atlas/atlas-data.json` |
| Source reference lock | `tests/reference/purpose-atlas-source/**` |
| Generated preview evidence | Nix and CI outputs |

Purpose Decision Atlas v6 uses `core+port as lib`.
Runtime input is expected to be `ADRS projected input` produced outside this repo.
A2UI is `a2ui as build`.
JSONL in this repo is `jsonl as attached data`.
Fixtures must be `stateless` and `non-authoritative`.
`ui.git is not a state store`.
