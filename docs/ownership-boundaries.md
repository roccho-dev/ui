# Browser UI ownership boundaries

This document is the discoverability artifact for **where browser-UI
responsibility lives across the SSOT repos**. `ui` is one of several repos that
touch A2UI / SDUI / board rendering, and those responsibilities are adjacent.
A fresh agent must read this before assuming `ui` owns a responsibility, and
before adding a responsibility to any sibling repo that this table assigns
elsewhere.

`ui` owns **the A2UI/SDUI component registry contract and renderer-neutral
component-tree projection** — nothing that hosts, serves, renders to HTML,
composes a specific board, validates policy, or owns canonical state.

## Browser UI SSOT inventory

Verified against each repo's `README.md` / sources on the `nixos-vm` SSOT
(`/home/nixos/repos/*.git`) on 2026-06-18.

| Repo / ref | Verified UI responsibility |
|---|---|
| `ui.git` @ `claude/ui-modeling-corr-port-260618` | `ui.component.registry.v1` contract + default catalog (33 components, 6 families), recursive node-tree projection (`projectNodeTree` / `projectA2uiSurface` / `projectQuestionnaireFlow` → `ui.surface.viewmodel.v1`), `targetRef` UI logs/actions (non-authority), adapter **descriptors** (no DOM). |
| `board-view.git` @ `main` | Composition boundary: composes read-model JSONL → `board-view.ir.v1` (renderer-neutral **board** IR). Owns the board composition/projection contract. Not canonical state, not HTML, not the WebMCP bridge. |
| `render-worktrees-agents.git` @ `main` | Renders `board-view.ir.json` → `board-view.html` (static HTML projection). Owns the worktree/agent command-board renderer and host artifacts (`Caddyfile`, `index.html`, `data.html`). Does not own canonical state. |
| `webmcp.git` @ `main` | Canonical **static WebMCP host** package: serves `dist/` and `/boards/*` read-only, exposes WebMCP tool(s)/component(s), reads organization/A2UI graph JSONL → `webmcp.organizationGraph.ir.v1`. Owns the static/source-serving boundary and the WebMCP query/action bridge. `Caddyfile` pins the origin. |
| `view` (working repo) @ `dev` | Lightweight Go viewer (`buildGoModule`) generating a `canonical.html` artifact from a CUE source of truth. Tests intentionally RED (`doCheck = false`); treat as semi-active/legacy. |
| `policy.git` @ `main` → `packages/sdui-policy-gate` | SDUI/A2UI policy **validation gate**: `validateSduiPolicySurface({ componentRegistry, ... })` consumes `ui`'s registry shape and flags `component_not_registered`, `component_surface_not_allowed`, raw-code, and authority claims. Owns validation authority; does not render/execute/approve/append. |
| `ops.git` @ `main` | Runtime collectors, Caddy operation, process supervision (runtime/collector owner). |

## Overlap map

Responsibilities that are **duplicated or adjacent** across these repos, and the
boundary that resolves each:

| Overlap area | Repos that touch it | Boundary |
|---|---|---|
| Renderer-neutral projection | `ui` (`ui.surface.viewmodel.v1`, generic component tree) ↔ `board-view` (`board-view.ir.v1`, board IR) | `ui` projects a **generic** A2UI/SDUI component node tree driven by the registry. `board-view` is the **board-specific** read-model composition. `ui` does **not** define board IR or board composition. |
| A2UI JSONL handling | `ui` (parses TreePatch/StatePatch → view model), `board-view` (composes A2UI JSONL → board IR), `render-worktrees-agents` (renders A2UI/HTML), `webmcp` (organization-graph A2UI JSONL → IR) | `ui` owns only the A2UI/SDUI **component catalog/contract** (which node types exist and what they accept/produce). Each sibling owns its own domain-specific compose / render / serve of A2UI streams. |
| HTML / static host / browser rendering | `render-worktrees-agents` (`board-view.html`), `webmcp` (static host + `dist/`), `view` (`canonical.html`) | `ui` stays **out** of HTML hosting and rendering. `ui` adapters/examples are descriptors and headless sample runs only — never an authoritative renderer or host. |
| SDUI validation | `ui` (registry = **data**) ↔ `sdui-policy-gate` (validation **authority**) | `ui` supplies the registry contract/shape that the gate consumes; the gate enforces it. `ui` never validates, approves, or gates a surface. |
| UI logs / `targetRef` vs canonical state | `ui` (`ui.log.record.v1`, non-authority) ↔ canonical state owners (specs/command/claim/event, `ops`) | `ui` records are explicitly non-authority (`canonicalStatus: "ui-log-not-authority"`, `approval/authorizesFire/authorizesMerge = false`). They never assert merge/approval/fire/canonical state. |

## Ownership decision

Explicit owner per responsibility (this is the authoritative split):

| Responsibility | Owner |
|---|---|
| A2UI/SDUI component registry contract, component catalog, `targetRef` UI logs, pure registry projections (component node trees) | `ui.git` |
| Board-specific JSONL/A2UI composition + `board-view.ir.v1` projection authority | `board-view.git` |
| Worktree/agent command-board renderer (IR → HTML) + host artifact generation | `render-worktrees-agents.git` |
| WebMCP static/source-serving boundary + web-core component-shape serving + WebMCP query/action bridge | `webmcp.git` |
| Lightweight Go/HTML CUE → `canonical.html` viewer (if active) | `view` |
| SDUI/A2UI policy validation/gates | `policy.git` → `packages/sdui-policy-gate` |
| Runtime collectors, Caddy, process supervision | `ops.git` |

## What `ui` does NOT own (no overclaim)

`ui` must **not** claim ownership of, or absorb, any of the following. Each
belongs to the owner named above:

- **Browser hosting / static host** — `webmcp` (and `render-worktrees-agents`
  host artifacts).
- **Caddy / origin configuration** — `ops` (operation), `webmcp` /
  `render-worktrees-agents` (their own `Caddyfile` artifacts).
- **Runtime collectors / ingress** — `ops`.
- **WebMCP source serving / `dist/` / `/boards/*` serving** — `webmcp`.
- **Board-view projection authority** (`board-view.ir.v1`, board composition) —
  `board-view`.
- **SDUI policy / validation authority** — `policy` (`sdui-policy-gate`).
- **Canonical business state, approval, merge, or fire authority** — domain
  records and their owners; never a UI repo.

If a change would make `ui` host, serve, render to HTML, compose a specific
board, or validate/approve a surface, it belongs in the owning sibling repo, not
here.
