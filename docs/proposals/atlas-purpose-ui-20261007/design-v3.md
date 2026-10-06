# P design v3 candidate — full display closure

Status: same-version agreement requested; no product implementation GO.
Source refs: P 6025725543 / R 6025432002 / W3 6025448785.
Visual examples: README / view.example.html / captured images.
UI base: 3fd451996d05e304a38be2a6696acb18b3103a37.
Apps base: 2022a8da358979b6360ef06795856b91b157185b.

## Target and boundary
One apps Atlas entry contains Purpose comparison and the existing Activity Atlas.
Purpose-only success is a checkpoint. Full success includes both surfaces and P's
actual product readback. Real OCI collection, all of apps#66, merge and close are
outside this discussion permission.

No new UI renderer, business parser in UI, generic framework, server or dev CI.
Apps owns closure presentation, M/R/E/S comparison, input ordering and context.
Existing UI owns graph/layout/camera/selection and the Activity screen.

## Complete physical tree (+ add / ~ modify / 0 unchanged)
```text
apps/
  flake.nix                                  ~ # single ui admission + atlas-dist
  flake.lock                                 ~ # same declared ui revision
  packages/atlas/
    closure.mjs                              0
    reduce.mjs                               0
    README.md                                ~
    presentation.mjs                         + # validate B/A; graph/detail/path/diff
    build.mjs                                + # exact inputs + artifact closure/receipt
    web/
      index.html                             + # one app shell, anchors, visible stack
      app.mjs                                + # both mounts, Purpose DOM, context, clocks
    fixtures/
      purpose.jsonl                          0
      current.jsonl                          0
      current.before.jsonl                   + # exact valid before source
    tests/
      closure.test.mjs                       0
      presentation.test.mjs                  + # meaning/relation/provenance + ID cases
      browser-e2e.mjs                        + # actual composed DOM/interaction
ui production / runtime registry / CI files   0
```

These are responsibility paths; a concrete source obstruction is reported before
expanding them. Do not add purpose-panel merely for naming symmetry.

## One actual artifact boundary
Use the single apps ui input, admitted to the above UI base for full composition.
Consume control-ui and semantic-map outputs from the same revision.
Do not mix adopted control with older semantic-map, or add a second permanent UI
input absent a demonstrated incompatibility. Voice's existing consumer behavior
and artifact provenance are affected admission checks, not assumed unchanged.

build.mjs consumes actual output roots and explicit representative input files.
It produces index.html, all referenced app/closure/presentation modules, admitted
UI package siblings, embedded or served data, and an actual receipt.
Relative imports resolve inside the artifact; overlapping copied files must have
identical bytes. The mock HTML/images are not product build inputs.
Receipt binds actual app/UI revisions and actual input/reduced/output bytes.
No manually transcribed hash becomes an execution gate.

Activity input is a declared synthetic representative from adopted UI; it is not
real OCI. The builder explicitly extracts UI-live input from any example envelope,
rather than assuming the entire example-only playback wrapper is loadHistory input.

## DOM and lifecycle
```html
<main data-atlas-app>
  <nav><a href="#purpose">Purpose</a><a href="#activity">Activity</a></nav>
  <section id="purpose">
    <header>Purpose before/after, Node / Relation / Source counters and legend</header>
    <div data-purpose-layout>
      <div data-purpose-graph></div>
      <aside>selected fields, Purpose paths, counterpart/tombstone, raw/sources</aside>
    </div>
  </section>
  <section id="activity"><!-- mountAtlasUI owns its DOM --></section>
</main>
```

Both sections are visible full-width vertical blocks. Narrow graph/detail may
stack. No display:none graph, mount/unmount tab cycle, ShadowRoot or iframe is
required. Mount each once at non-zero geometry; use existing fit/selection APIs.
Activity's 100vh screen, search, audit, inspector and history remain intact.
Purpose styles are app-scoped; P checks global UI style interaction.
Activity history/currentness and Purpose comparison are independent.
Context is namespaced by surface + opaque id. No cross-highlight without an
explicit owning link input; owner/scope/label matching is not a link.

## Pure presentation / truthful differences
Validate before and after independently using adopted closure semantics.
M = declared fields excluding typed references and sources.
R = normalized typed reference fields.
E = typed directed relation tuples.
S = normalized sources.
N+/N- are presence; NΔ compares M only; RΔ compares R; E+/- are edges; SΔ is audit.
Do not sum these axes as a fictitious total business change count.
Reference-only next/parents changes are not business meaning mutations.

Projection preserves business id/label/kind/raw/sources.
Its visual grouping root is collision-checked and UI-only.
Edge encoding is injective over the typed tuple; delimiter concatenation cannot
merge opaque IDs containing punctuation.
Graph geometry is existing UI's responsibility, not mock coordinates.

Selected missing id remains selected logically: show the other snapshot's
label/kind/fields/raw/sources and explicit "unlisted / reason not provided".
Do not invent deletion/completion/reason. E- uses a valid reconciled replacement
snapshot, never oldReduced + omission under monotonic join.

## Completion verification
Pure: 7 meanings, all/multiple Purpose roots, late upstream/next, independent B/A,
M/R/E/S, provenance-only/reference-only, N-/E-, injective/collision-safe ids,
no inferred Activity link, raw preservation and existing 112-case invariants.

Artifact: same UI revision, complete actual module/data closure, declared sample
inputs, receipt, no mock/renderer copy, existing voice consumer admission.

Composed browser: both surfaces, non-zero geometry, no style/control overlap,
selection/counterpart, meaningful labels, truthful counters, path/Gap fields,
same-page raw, keyboard navigation, Fit/zoom/pan, independent contexts,
and existing Activity search/audit/history/Inspector/currentness behavior.

P actual readback uses the same product artifact/entry with exact Purpose pair,
Activity sample, viewport, selected surface/id, operation, expectation/actual,
screenshots and PASS/FAIL. Mock images never replace this gate.

## Small closed process
```mermaid
flowchart LR
  A["P/R/W3 same design"] --> B["W3 bounded app + UI admission + build"]
  B --> C["R source/closure/DOM"]
  C --> D["P same artifact, both surfaces"]
  D --> E{"all required evidence / residual 0?"}
  E -- "ordinary defect" --> B
  E -- "new authority or material boundary" --> A
  E -- "yes" --> F["R terminal display gate → Human adoption"]
```

Discussion uses local HTML/captured images/P readback; no CI generation dependency.
Future affected existing checks use the production build; no new dev workflow,
artifact ledger or CI-only alternative page. This document does not start them.

