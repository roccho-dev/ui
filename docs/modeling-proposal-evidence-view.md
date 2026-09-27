# Modeling proposal evidence view

## Purpose

UI may display `modeling.proposal.v1` records as evidence so a human can inspect target, operation, status, and supporting notes.

The display is non-authority. It is not an approval surface and it does not promote proposals to model queue, admission, accepted ledger, or receipts.

## Data flow

```text
agent / ops proposal output
  -> modeling.proposal.v1 evidence input
  -> ui modeling proposal evidence preview
  -> human review outside UI
  -> ops promotion / admission path
```

## UI may show

- proposal id
- proposal status
- targetRef summary
- proposed operation
- evidence notes
- promotion owner
- non-authority marker

## UI must not show

- approve button
- promote button
- queue write button
- admission button
- accepted ledger write button
- dispatch / merge / fire button

## Boundary

Promotion belongs to ops. UI is only a read-only evidence view.
