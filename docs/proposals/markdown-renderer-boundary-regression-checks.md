# Markdown renderer boundary regression checks proposal

## Why

The UI renderer lane is complete, but the completed boundary should be guarded against future drift. ui-lib should remain a Markdown renderer only.

## Direction

Add UI-side fixtures or checks for the four highest-risk renderer boundary regressions.

## Required regressions

1. ui-lib must not read ADR rows;
2. ui-lib must not perform governance policy validation;
3. ui-lib must not emit HTML in the README artifact path;
4. ui-lib must not upload artifacts or own artifact lifecycle.

## Boundary

These checks protect the completed renderer boundary. They do not implement new rendering formats, DD view, transfer view, or repo CI ownership.

## Merge Gate

Merge only if each regression has a failing fixture or check plan and the failure reason is explicit.