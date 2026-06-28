# Purpose Atlas SDUI expectation ledger

## Status

Proposal / requirement ledger for the Purpose Atlas SDUI migration.

This proposal assumes the following PRs are expected to merge first:

- #37 `Probe Purpose Atlas JSONL to HTML build`
- #38 `Move Purpose Atlas layout and CSS into A2UI SDUI`

This file is not an ADRS authority record. It is a UI-side expectation ledger and review checklist for mergeable Purpose Atlas work.

## Scope boundary

This UI repository owns the projection surface, renderer boundary, preview build, and UI fixture checks. It must not become the authority for business intent, governance admission, GitHub work-order generation, or closure receipts.

| Source of truth | Responsibility |
| --- | --- |
| ADRS | Purpose, policy, delta/gap/fill/receipt contract authority |
| governance | Projection/compiler/check generation from ADRS and receipts |
| ui | Surface JSONL, SDUI rendering boundary, Purpose Atlas preview artifact |
| GitHub Issues/PRs | Assignment, review history, merge ledger |
| ops | Runtime/repo reality and fill implementation receipts |

## Expected requirements and background

| # | Requirement | Background / why it exists | UI repo acceptance |
| ---: | --- | --- | --- |
| 1 | UI is a projection/control plane, not the authority. | The source of meaning must stay in ADRS/governance so generated UI cannot become an unreviewed policy source. | Proposal wording and code boundaries keep UI as non-authority projection. |
| 2 | #37 and #38 are merge premises. | #37 proves the HTML preview path from surface/data fixtures; #38 moves layout/CSS into SDUI and creates the active migration base. | This follow-up is reviewed as after/alongside #37/#38, not as a replacement. |
| 3 | Surface JSONL owns layout, chrome, and CSS. | The product owner wants UI layout/design separated from renderer code and adjustable through surface fixture changes. | Layout/chrome/CSS do not drift back into `A2uiSduiSurface` or atlas renderer code. |
| 4 | Renderer owns SDUI execution only. | SOLID boundary: rendering engine should interpret a document, not embed product layout. | Component renderer remains generic: bindings, conditionals, primitive nodes, actions, ports. |
| 5 | Atlas graph drawing remains a port. | The map is specialized and should not be reimplemented as generic boxes. | `atlasStage` remains a required port and keeps the existing graph renderer path. |
| 6 | The central map must never be killed. | The map shows closure toward the terminal objective; removing it destroys the core Purpose Atlas value. | Tests/checks assert an atlas stage port exists in the active surface. |
| 7 | Preserve the legacy graph grammar. | Previous UI had a recognizable map made from territory/Voronoi-like layer, nodes, edges, and actor rings. | SDUI chrome may change, but graph visual grammar remains in the atlas renderer. |
| 8 | Preserve the Voronoi/territory layer. | A plain node-link diagram loses the “地形 / route / closure” cognition. | No SDUI migration may replace the atlas map with a lane-only or flat node-edge view. |
| 9 | Preserve node/edge/actor ring semantics. | Actor responsibility and route evidence are visible through rings and supporting edges. | Renderer continues drawing nodes, supporting edges, and responsibility rings. |
| 10 | The terminal objective must stay visible or inferable from the map. | Users must see that gaps/fill work close toward the highest objective, not local busywork. | G0/G1 purpose nodes or equivalent HUD context remain present. |
| 11 | Map-first layout. | Upper explanations and always-open side panels reduce map area and make route cognition worse. | The map occupies the primary viewport area by default. |
| 12 | Top explanation is not required. | A long header duplicates what the map/selection panel should explain and steals vertical space. | Default map-first surface has no long top explanation. |
| 13 | Keep only minimal persistent chrome. | KISS/YAGNI: persistent UI should only answer objective, slide position, status, and controls. | Persistent controls are slim: objective/status, mode if needed, slider, previous/next. |
| 14 | Use a slider for slide/step navigation. | ADRS is merged over time; the user wants slide-like replay, not dozens of tick buttons. | Timeline control is a slider bound to step/slide index. |
| 15 | Treat displayed steps as ADRS merge slides. | Source history should be interpreted as projection windows over merged ADRS, not arbitrary fixture ticks. | Labels and docs use “slide” for user-facing navigation. |
| 16 | Do not use source `t` as authority. | `t=1..n` breaks when historical ADRS records are inserted or projection windows change. | UI source accepts/targets `ts + seq + id`; any numeric slide index is derived. |
| 17 | Normalize event ordering with `ts + seq + id`. | Timestamp alone cannot order simultaneous or later-backfilled records. | Data compiler/tests sort by `(ts, seq, id)` when available. |
| 18 | Add `projection.header`. | The UI must explain which input set, time, purpose, and projection policy produced the visible map. | Projection data can carry `projection_id`, `selected_objective_id`, `as_of_ts`, `source_basis`, `source_digest`, `anchor_event_id`, `visible_window`, and policy version. |
| 19 | Support `anchor_event_id`. | Large ADRS history needs an explicit viewing origin; `step=0` is not enough. | UI/data model can start replay from a projection anchor. |
| 20 | Carry `source_digest`. | Avoid acting on stale or mismatched projections. | Digest fields are preserved/displayable in projection metadata. |
| 21 | Data should move toward JSONL. | JSONL keeps projection inputs appendable, diffable, and compiler-friendly. | UI can consume compiled atlas-data while keeping source fixture/proposal path for JSONL. |
| 22 | Do not treat “currently visible to the assistant” as source truth. | Conversation-derived snapshots are temporary observations, not stable repo authority. | Fixtures are explicit projection examples, not claims of complete organizational state. |
| 23 | Show ideal/current/gap/fill/receipt as projection data. | The UI’s job is to make purpose deltas operational: route, gap, work order, and evidence. | Atlas data can represent `ideal`, `current`, `gap`, `fill_ticket`, `receipt`, and `residual`. |
| 24 | Gap means `current -> gap -> ideal`. | This gives a stable graph meaning instead of a visual red badge only. | Gap nodes/edges can express current evidence, ideal target, and closure work. |
| 25 | Fill tickets must be visible as assignable units. | Users want to say “ここ担当して” from UI-generated work. | Work-order nodes have target repo/role/ref fields when data provides them. |
| 26 | `github_ref` must be displayable. | Assignment/review/merge history lives in GitHub, not inside the UI. | UI nodes can surface Issue/PR references without becoming their source. |
| 27 | Detail panel appears only when something is selected. | Always-open panels consume map area and duplicate the graph. | SDUI document uses conditional rendering for inspector/detail panel. |
| 28 | Selection panel must not replace the map. | Details explain a selected point; they should not become the primary view. | Panel overlays or sidecars only after selection, and map remains visible. |
| 29 | Empty click / clear selection hides detail panel. | The map should return to full context quickly. | Existing selection clear action remains wired. |
| 30 | Preserve mode switching only if it adds value. | Purpose/responsibility/focus modes are useful, but should not dominate chrome. | Mode controls are compact and may be hidden/minimized in map-first mode. |
| 31 | Preview HTML remains generated, not tracked. | HTML artifact is a receipt/build output, not source. | No generated `dist/*.html` is committed. |
| 32 | HTML hand-editing is prohibited. | Hand-edited HTML produces merge-unsafe demos and bypasses SDUI contracts. | All visual changes come from surface/data/compiler changes. |
| 33 | Keep backward compatibility for `AtlasSourceSurface` where possible. | #37-era fixtures and callers may still refer to the old component name. | Compatibility alias remains until intentionally retired. |
| 34 | If a surface setting cannot express a UI need, add the smallest generic SDUI capability. | Avoid one-off hardcoded product props while still keeping surface-driven layout. | New primitives remain minimal and reusable, e.g. `when`, `slider`, `port`. |
| 35 | No renderer-specific layout/CSS regression. | The main purpose of #38 is to prevent layout from returning to JS/CSS component code. | Boundary checks fail if product layout/CSS moves back into renderer. |
| 36 | KISS. | Avoid adding a parallel UI framework when a tiny SDUI document and existing port suffice. | Prefer minimal primitives and fixture changes. |
| 37 | SOLID. | Renderer, graph port, data projection, and policy authority should have separate reasons to change. | Each layer has a narrow responsibility. |
| 38 | YAGNI. | Do not implement ticket automation, ADRS compiler, or receipt authority in the UI PR. | UI PR only makes those concepts representable/displayable. |
| 39 | DRY. | Layout/CSS must not be duplicated in JS and JSONL. | Surface JSONL is the layout source for Purpose Atlas chrome. |
| 40 | Mobile must keep map-first behavior. | On small screens, permanent panels are especially destructive. | Inspector is selection-triggered and map remains primary. |
| 41 | Generated receipt/CI status is not the same as closure. | CI green only proves checks passed; closure requires gap-specific receipt. | UI labels avoid equating build success with purpose closure. |
| 42 | ADRS/governance-owned items remain out of UI scope. | `accepted delta -> fill/no-fill`, source digests, and projection authority are not UI authority. | UI docs call these dependencies out instead of silently owning them. |

## Required merge posture

This ledger should be used as the review checklist for Purpose Atlas SDUI merge work. The expected merge order is:

1. Merge #37 for the JSONL-to-HTML preview proof path.
2. Merge #38 for SDUI layout/CSS migration.
3. Apply follow-up UI surface/data refinements against the SDUI base.
4. Keep ADRS/governance/compiler/receipt authority in their own repos and PRs.

## Non-goals for this UI PR line

- Do not implement ADRS authority in ui.
- Do not implement governance admission or delta/fill compiler in ui.
- Do not auto-create GitHub Issues/PRs from ui.
- Do not track generated HTML.
- Do not replace the atlas graph renderer with a generic SDUI box graph.

## Acceptance checklist for follow-up UI changes

- [ ] Active surface is SDUI-driven.
- [ ] `atlasStage` port remains present.
- [ ] Voronoi/territory-style map remains visible.
- [ ] Node/edge/actor-ring semantics remain visible.
- [ ] Detail panel is hidden until selection.
- [ ] Slider replaces dense tick-button timeline in map-first layout.
- [ ] Long top explanation is absent in default map-first layout.
- [ ] The map remains the largest element in the viewport.
- [ ] Surface/data changes are source; generated HTML is not committed.
- [ ] Boundary tests guard against layout/CSS drifting back into renderer code.
- [ ] Any source event fixture avoids authoritative `t` and moves toward `ts + seq + id + projection.header`.
