# Purpose adapter PR-4: closure proof

## Goal
Strengthen the purpose adapter proof from artifact existence to replayable purpose-closure evidence.

## Primary gap
The proof must show that the generated purpose artifact came from checked inputs and that the loop can return closed and residual results into the next projection.

## Scope
- Keep the real Purpose Atlas fixture source path introduced after PR-1.
- Add source digest and projection digest to the proof report.
- Check allowed actions and allowed ports from the purpose requirement pack.
- Check required top-level input shape.
- Check work order staleness against projection digest.
- Check receipt closed, reduced, and residual fields.
- Keep the proof non-authoritative.

## Non-scope
- No merge decision automation.
- No external service deployment.
- No product runtime state.

## Acceptance
- Missing source digest is rejected by the proof check.
- Unexpected action or port is rejected by the proof check.
- Missing input shape is rejected by the proof check.
- Work order without current projection digest is rejected by the proof check.
- Receipt without residual handling is rejected by the proof check.
- Proof report lists checked inputs, checked outputs, closed gaps, and remaining residuals.
- Broken-case tests prove the gate can go red.

## Dependency
This branch is rebuilt on top of the merged real-fixture artifact follow-up. Docs must follow this proof shape.
