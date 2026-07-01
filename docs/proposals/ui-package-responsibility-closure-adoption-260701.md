# UI package responsibility closure adoption work order

## Purpose

Adopt the package responsibility closure plane in `roccho-dev/ui`.

The goal is to make UI packages answer ADRS package obligations with package inventory, package responses, proof, receipts, and residuals.

This PR is a work specification. It does not implement the full UI package inventory scanner, JSX-to-A2UI compiler, or strict governance gate.

## Primary gaps

| Gap | Current | Expected closure |
|---|---|---|
| UI package inventory is incomplete | repo has package-like paths and CI surfaces, but no canonical `packageInventory.v1` output | emit UI inventory rows for package surfaces |
| UI response rows do not cover all ADRS package obligations | existing response file covers selected UI evidence packages only | map ADRS seed obligations and future `ui.jsx-a2ui-compiler` obligation into response rows |
| `ui.jsx-a2ui-compiler` is ADRS-proposed but not answered | ADRS defines the package, but UI has no implementation response yet | emit explicit `blocked` or `residual` response until implemented |
| PR work orders are not driven by drift rows | work is still PR-title driven | use `packageDrift.v1` rows as primary gaps |

## Required UI outputs

### `packageInventory.v1`

UI should emit inventory rows for at least:

| package_id candidate | package_path | source kind |
|---|---|---|
| `ui.core-port` | `packages/core-port` | workspace/source package |
| `ui.a2ui-adapter-artifacts` | `packages/a2ui-adapter-artifacts` | artifact builder source package |
| `ui.ui-claims` | `packages/ui-claims` | package response source |
| `ui.ui-projection-evidence` | `packages/ui-projection-evidence` | evidence source |
| `ui.ui-receipts` | `packages/ui-receipts` | receipt/residual source |
| `ui.jsx-a2ui-compiler` | `packages/jsx-a2ui-compiler` | future package; absent until implemented |

Generated HTML, screenshots, preview outputs, packed artifacts, and README artifacts must not be counted as source packages.

### `packageResponse.v1`

UI should normalize its package responses into governance-readable rows.

Minimum expected states:

| package_id | expected state |
|---|---|
| `ui.projection-evidence` | adopted when evidence/tests/receipt are present |
| `ui.receipts` | adopted when residuals are visible and closed/returned |
| `ui.artifact-boundary` | adopted when generated output boundary is checked |
| `ui.gov-check-adoption` | adopted when governance package validation is wired |
| `ui.jsx-a2ui-compiler` | blocked or residual until package exists and required tests pass |

## `ui.jsx-a2ui-compiler` obligation response

Until the compiler exists, UI should not stay silent.

The first valid response can be:

```text
state: residual
blocked_reason: package not implemented yet
residuals: [create package skeleton, add fixture tests, add protocol shape check, add token variation check, add deterministic output check]
overclaim_boundary: does not claim compiler implementation
```

Required test ids to answer later:

- `jsx-a2ui-compiler-fixture-check`
- `a2ui-protocol-shape-check`
- `brand-token-variation-check`
- `generated-output-boundary-check`
- `deterministic-output-check`

## PR work-order rule

Each future UI package PR should declare:

| Section | Required value |
|---|---|
| Primary gap | one UI `packageDrift.v1` row or bounded batch |
| Current | UI obligation/inventory/response before PR |
| Ideal | expected post-PR drift status |
| Proof | exact check/artifact proving closure or reduction |
| Receipt | response receipt or residual return |
| Non-scope | no UI authority claim, no generated artifact authority |

## Initial PR decomposition

| PR | Purpose |
|---|---|
| UI inventory emitter | emit `packageInventory.v1` for source package surfaces |
| UI response normalizer | keep existing response rows and normalize to canonical governance shape |
| JSX-to-A2UI residual response | answer ADRS obligation without claiming implementation |
| JSX-to-A2UI package skeleton | create package path and fixture gate |
| JSX-to-A2UI compiler implementation | implement only after residual response and tests are present |

## Non-goals

- Do not claim `ui.jsx-a2ui-compiler` is implemented in this work-order PR.
- Do not make UI a meaning authority for ADRS obligations.
- Do not count generated previews or artifacts as source packages.
- Do not hide residuals in PR text only; residuals must be machine-readable.
- Do not make selected rollout an all-repo strict gate.

## Acceptance

This PR is complete as a work order when it defines how UI will emit package inventory, package responses, receipts, and residuals for package responsibility closure.

A later implementation PR is complete only when governance drift rows for the targeted UI package disappear or are explicitly reduced with machine-readable residuals.
