# Integrated Atlas HTML candidate — v6

Status: candidate for P/R/W3 same-source agreement. Product implementation is not started.
This supersedes v5 placement as the visual target; v5 data/truth invariants remain applicable.

## Goal and actual baseline

Keep the confirmed Atlas experience at http://127.0.0.1:18185/#sel=cto,
and bring the v4 Purpose relation/path/compare meaning into that same application.
The CLI evidence page atlas-closure-2022a8d is not this UI target.

18185 baseline source: ui@32528106135160574d4ece2c8537cc5dbd0b4f75.
P compared the served rewritten atlas.mjs with the module packed from that
existing checkout; bytes match. This does not claim every served module was compared.

The baseline embedded input and the resolved adopted fixture have identical bytes:
tests/fixtures/live-atlas/history.json -> revisions 1,2,3,5;
162403 bytes; computed SHA256 006a3e131242e3b16ac229c74ab66730259b9bc57d01c169eebbc98084b165c6.
This is source evidence, not a copied hash execution gate.

Activity in this candidate is actually mounted by the existing
mountAtlasUI at adopted ui@3fd451996d05e304a38be2a6696acb18b3103a37.
Purpose is handwritten discussion SVG/DOM based on the v4 valid pairs;
it is not proof of a shipped Purpose renderer or adapter.

## One root / continuous visible contexts

```html
<main data-atlas-demo>
  <div id="app-chrome">
    Atlas / navigation anchors
    Activity selected id + mode/rev
    Purpose selected id + case/side
    explicit indication: no Activity↔Purpose relation input
  </div>
  <div id="views">
    <section id="activity-view">
      <div id="activity-root">
        <!-- unchanged actual mountAtlasUI owns screen + detail -->
      </div>
    </section>
    <section id="purpose-view">
      comparison controls
      relation graph
      selected fields + all Purpose paths
      raw / sources + selected before/after comparison
    </section>
  </div>
</main>
```

Activity remains the first DOM concern; its original screen/detail stay owned by
the actual component. Purpose follows it under the same app root. Wide screens
place Purpose on the right, with independent scroll areas so inspecting Purpose
does not scroll Activity away. At <=1100px both are visible in normal document
flow; navigation anchors reach them, and the context strip remains visible.

No stage swap, hidden graph, mount/unmount cycle, new Activity renderer,
private toolbar/Inspector injection, cross-highlight, iframe or ShadowRoot.
App-scoped CSS adapts the existing Activity detail table to its narrower container;
it does not replace the original contents. Purpose fields are not injected into
the Activity Inspector.

The app chrome height is measured from actual DOM, so a narrow screen's wrapped
context strip cannot cover the Purpose controls reached via an anchor.

## Meaning and operation

activityContext = { surface:'activity', id, activityRevision }
purposeContext = { surface:'purpose', id, comparisonCase, comparisonSide }
crossSurfaceLinks = []  // no explicit bridge source has been supplied

Changing one context does not advance or select the other.
t-purpose's class/label, CTO membership or gap.owner never creates a relation.

Purpose retains the v4 relations:
Purpose -> Ideal -> Gap -> Fill -> Receipt -> Residual -> next Gap.
Every selected item has all declared paths to top-level purposes, and paths are
clickable. Gap detail separates Current condition, Ideal, declared delta,
owner and proof from Activity currentness.

Comparison retains independent axes:
M = meaning fields excluding typed references and sources.
R = typed references; E = typed directed relation tuples; S = provenance.
N+/N- are presence; NΔ compares M only; RΔ and SΔ are independent.
No combined business-change total is fabricated.

Case A: N+3 / N-0 / MΔ0 / RΔ1 / E+4 / E-0 / SΔ1.
Case B (independently named replacement): N+0 / N-3 / MΔ0 / RΔ1 /
E+0 / E-4 / SΔ5.
Missing selection preserves the counterpart's label/fields/path/raw/sources and
states "unlisted / reason not provided". Receipt or next=[] does not mean Purpose achieved.

## Evidence production without development CI

Source: integration.example.html.
Host: http://127.0.0.1:18186/atlas-integration-v5/index.html.

The source template has three assembly placeholders: @IMPORTMAP, @ACTIVITY_INPUT,
@NOTICES. Local assembly uses only existing exports:
packBrowserModules(entry=packages/control/atlas-ui.mjs, roots=ATLAS_MODULE_ROOTS),
resolveHistory(tests/fixtures/live-atlas/history.json), embeddedNoticesScript.
The existing UI closure supplies 150 modules as a data-URL import map.
Template placeholders are replaced, and index.html plus a computed receipt are
written into one new generated directory under the existing static host.
No workflow/server/source dependency/CI-generated HTML is added.
The generated full HTML is non-authoritative; the source template and UI/fixture
references define its reproducible inputs.

Captured JPEGs are actual browser pixels, unmodified:
integration.overview.jpg, integration.gap.jpg, integration.removal.jpg,
integration.narrow.jpg. The source HTML and image set belong to the same candidate.
Backend screenshots are JPEG, so filenames use .jpg rather than relabelling PNG.

## P actual readback

1280x720 and 500x800 outer viewport; narrow document client width 485 due scrollbar.

| Operation | Actual |
|---|---|
| Initial overview | Activity cto/SAMPLE rev5, scope/org/4-ref graph and Purpose Residual before coexist |
| Purpose after | same selected residual.source; Case A counts above; Activity cto/rev5 retained |
| Residual -> next Gap | Gap Current/Ideal/delta/owner/proof and Purpose path readable; Activity retained |
| Activity history ArrowLeft | Activity HISTORY rev3; Purpose Gap/case/side retained |
| Search t-purpose + Enter | Activity selects t-purpose; Purpose unchanged; no inferred cross-link |
| Restore Activity cto/rev5 | independent of Purpose comparison |
| Replacement after | selected gap.source logically retained; counterpart fields and reason-not-provided visible |
| Raw disclosure | prior Gap's full JSON and sources/digest retained in the same page |
| Narrow navigation | both contexts visible; Purpose controls below chrome, not covered |
| Narrow width | document client/scroll width both 485; graph's horizontal scroll stays in its own stage |
| Console | no reported errors in this candidate |

P found and corrected concrete prototype defects before this candidate:
global scroll removed Activity while reading Purpose; narrow two-column audit
wrapped raw text into single characters; Activity history was labelled SAMPLE;
wrapped chrome covered narrow Purpose controls. The corrected candidate uses
independent wide panes, single-column Activity detail, honest HISTORY label and
measured chrome offset. These are visual discussion fixes, not product fixes.

Remaining design questions belong to same-source R/W3 counter-review.
Product build/reuse/UNKNOWN replay/generic graph camera/admission requirements
remain future product verification; these discussion captures do not close them.

## Planned boundary after visual agreement

The v5 apps-only 11-path plan and UI delta 0 remain implementation candidates,
not proven results. A product must use the existing generic renderer/layout
instead of copying discussion geometry. Actual source obstructions or public
composition seams are assessed before that later implementation begins.
This HTML agreement does not authorize product source, merge, Issue close,
real OCI collection or apps#66 completion.

