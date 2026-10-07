# One-world Atlas — discussion canonical specification

Status: current discussion specification for this proposal directory. It preserves
the agreed comparison meanings and the reproducible one-world example. It is **not**
an apps business contract, production input authority, owning adapter contract, or
generic UI comparator implementation.

The former v7/two-pane/11-path material below is retained only where it explains
the current example or historical derivation. Historical implementation shapes do
not become current product requirements.

## Authority boundary

Authority remains separated:

- owning domains/adapters define business meaning, typed references, relation
  identity/meaning, source evidence and temporal semantics;
- this discussion input declares the exact synthetic source/version alignment and
  explicit bridge assertions used by this example;
- the UI displays supplied facts and comparison results; it does not infer
  Purpose/Gap/owner/relation semantics from labels, endpoint shape or position;
- current a2/product GREEN elsewhere is not proof of the world-wide comparison
  axes documented here.

“Discussion canonical” therefore means one place to read this proposal's live
invariants, not one source of truth for the wider product.

## Comparison invariants

Let `Q(F)` be the set of qualified entity identities explicitly present in Frame
`F`. Identity is source-space/kind/id qualified; equal raw strings across spaces
never collapse.

```text
N+(F0,F1) = Q(F1) - Q(F0)
N-(F0,F1) = Q(F0) - Q(F1)
```

For identities present on both sides, comparison semantics are supplied by the
owner/domain comparator:

```text
MΔ = changed owner-normalized declared entity/business meaning
RΔ = changed owner-normalized typed references
SΔ = changed provenance/evidence
TΔ = changed supplied temporal metadata
```

Relations are explicit facts with owner-defined identity/meaning. Let `ER(F)`
be the owner-normalized explicit relation facts present in `F`:

```text
E+(F0,F1) = ER(F1) - ER(F0)
E-(F0,F1) = ER(F0) - ER(F1)
```

The discussion runtime currently uses `[space, kind, from, to]` as its fixture
edge-presence key. That is an example implementation, **not** a generic law:
independent RelationRefs/context may coexist for the same endpoints/kind and must
not be collapsed by a future production comparator.

The complete Frame comparison is the orthogonal result:

```text
D(F0,F1) = (N+, N-, MΔ, RΔ, E+, E-, SΔ, TΔ)
```

Axes may change together; their counts are never summed into a total progress,
quality, completion, or Purpose-achievement score. The old ambiguous `NΔ`
wording means `MΔ` when it referred to same-identity meaning change.

Business Gap, Frame delta and observation/history completeness remain distinct:

```text
G(F)      = owner typedCompare(Ideal(F), Current(F))
D(F0,F1) = declared Frame comparison
ObsGap    = missing/incomplete acquisition or history
```

If an owner supplies an effective-time binding for `F`, `G(F)` may be read as
`G(t)`. An unavailable Purpose effective time remains unavailable; nearby
Activity time does not fill it. Work/Receipt/Residual state does not imply Purpose
achievement. A missing identity in one Frame means “unlisted here”; without an
owner reason it is not deletion, completion, or withdrawal.

The historical `parts()` classifier and its space/kind field allowlists are
discussion implementation details. They must not be copied into generic a2/UI
code. M/R/E classification, including relation context/containment meaning, is
owner-defined and supplied explicitly.

## Normalization correspondence and deletion gate

This table is the first-slice mapping from live historical invariants into the
current discussion entry. “Mapped” does **not** authorize deletion by itself;
P/R must still prove the current input/reconstruction/interaction correspondence
before a historical file is removed.

| Live invariant | Saved here | Logical input | Reconstruction/runtime | Operation/oracle | First-slice state |
| --- | --- | --- | --- | --- | --- |
| Qualified identity; N+/N- are presence only | Comparison invariants; Unified interaction and identity | qualified Activity/Purpose refs in `unified.input.example.json` | `world()`, compact reversible projection IDs | Frame A/B switch; same qualified selection; raw-ID collision remains distinct | mapped; proof pending |
| M/R/S/T remain distinct; old NΔ→MΔ | Comparison invariants | literal source records + sources + comparison basis | fixture `parts()/differences()` illustrates current classification only | visible MΔ/RΔ/SΔ/TΔ counters + selected raw/source/time detail | mapped; owner semantics ceiling explicit |
| Explicit relation/bridge only; no label/title inference | Authority boundary; Explicit discussion inputs | literal `bridges` + sourceRef/sourceDigest | `world()` adds bridge only when supplied | bridge toggle off removes bridge; no inferred replacement | mapped |
| Relation multiplicity/identity must not be collapsed generically | Comparison invariants | explicit relation records/bridge IDs; owning relation semantics remain external | current fixture edge tuple is marked example-only | edge selection exposes explicit relation/source; production identity not claimed | mapped; production comparator non-scope |
| Unknown Purpose effective time; no same-time invention | Comparison invariants; Explicit discussion inputs | `purposeEffectiveAt: null` | assembler basis + derived `sameEffectiveTime` | basis/detail says Purpose time unavailable | mapped |
| Independent named replacement; unlisted != deleted/completed | Comparison invariants; Explicit discussion inputs | literal `purposeSnapshots.replacement` + named case | assembler builds independent pair | replacement switch preserves selected counterpart and reason-not-provided | mapped |
| Business Gap != Frame delta != observation gap | Comparison invariants; Recognition and API | owner Purpose records + explicit frame basis + Activity history | Purpose path/detail + Frame comparison + Activity history | Gap detail, Frame diff, observation-gap notice are separately readable | mapped |
| One world, one qualified selection, explicit pair | Unified interaction and identity | one logical discussion input binding multiple source domains | one scene/adapter; before/after side | shared selection/detail/camera; counterpart survives absence | mapped |
| Source/evidence authority != interaction policy | Authority boundary; Files and local assembly | immutable logical declarations vs runtime bridge-input variant | assembler binds source digests; runtime derives effective basis | input audit exposes declared/effective comparison separately | mapped |

Deletion gate for `design.md`, `integration.*`, `view.*` and
`current.replacement.example.jsonl` remains conditional. No history file should
leave the canonical tree until an independent review confirms that every unique
live invariant is represented above (or elsewhere in this specification) and is
reproducible through the current input/runtime/operation evidence.


## Recognition and API

Purpose, organization, work, result and remaining work can be one typed world.
Current Activity and Purpose APIs differ in source ownership/shape and projection
maturity, not because the user needs two permanent worlds.

Existing Activity:
loadHistory / currentness / projectAtlas, observed topology/work/status,
rev/asOf/observedAt, completeness and freshness.

Existing Purpose:
atlas.purpose-closure/1, seven business kinds, typed refs/sources;
no effective/observed time fields in the adopted v1.

Both ultimately use generic regions/relations and the same maxGraph renderer.
This example uses those existing projectors and one adapter/rendered scene.
It does not pretend mountAtlasUI already exposes a unified-scene composition port.

G(F) = typedCompare(Ideal(F), Current(F)).
If an owner supplies an effective-time binding for F, this can be read as G(t).
D(F0,F1) compares the declared composed frames, including the Gap's evolution.
Activity missing rev4 between rev3 and rev5 is an observation/history gap.
These are distinct meanings displayed through one comparison interaction.
String Current/Ideal values are not subtracted as numbers.

## Explicit discussion inputs

1. Original adopted Activity fixture/history, unchanged.
2. The valid Purpose before/after pair and independent named replacement.
3. Two explicit synthetic typed bridge assertions with sourceRef/sourceDigest:
   activity actor ceo --serves--> purpose purpose.company;
   activity work w-render-3 --contributes-to--> purpose fill.extraction.
4. App-owner comparison basis specifying each side's source revisions/digests.

CEO is the existing actor labelled CEO; no role/person assignment or stronger
legal accountability is invented. The Work bridge is illustrative auxiliary
contribution, not proof that actual PR331 performed bootstrap extraction.

Case A:
F0 = Activity rev3/asOf00:30 + Purpose before@1;
F1 = Activity rev5/asOf00:50 + Purpose after@2.
Case B:
both sides retain Activity rev5/asOf00:50;
Purpose prior@2 -> independently named replacement@1.

These are explicit synthetic scenario/version alignments, not same-time claims.
Purpose effective time stays unavailable. The original source has not acquired
time because it appears beside an Activity date.

Bridge-input off is a different supplied-input variant, not a hidden view filter.
The effective frame ID has an unlinked suffix, bridgeSource=null, no supplied
bridge edges. Declared and effective frame bases are both auditable.
No CTO/CEO/title/t-purpose/class/owner match can invent a connector.

## Unified interaction and identity

One graph canvas, one selected-item detail, one before/after operation.
Selection uses space/kind/id; UI-only compact IDs have a reverse map.
Identity never collapses from equal raw strings across source spaces.

Node selection, bridge-edge selection and traversal use the same detail.
Each source domain's fields, observation/valid-time absence, evidence/sources,
raw and before/after counterpart remain readable.
A missing selected Gap keeps its previous counterpart and reason-not-provided.
Work completed and Receipt reduced do not mean Purpose achieved.

Meaning M excludes refs/provenance/time; R holds typed refs; E is active typed
relation presence; S is source/evidence; T is supplied temporal metadata.
Activity status reports are included in entity meaning separately from their
observed timestamps. Frame/basis changes are separately auditable.
S/T updates are not promoted into business meaning.
Derived hierarchy counts are not summed as a fictitious global work total.

## Actual rendering boundary

The existing Activity projector preserves scope containment, actors/org, work,
refs and status/currentness/LOD.
The existing generic semantic-map projector/layout renders Purpose.
The experimental discussion host namespaces and transforms both projections
into one generic scene and adds only explicitly supplied bridge primitives.
One existing maxGraph adapter renders it, with shared selection/camera controls.
Purpose captions are fixture presentation summaries; original labels remain
in detail/raw. Layout positions are not time coordinates.

The host is discussion code. No production renderer/business parser/seam changes
have been made. Later product work must avoid duplicating the proven Activity
draw/history machinery, and prove a minimal generic composition port if needed.
UI must not learn CEO/Purpose/Gap business predicates.

## Files and local assembly

unified.input.example.json is the immutable discussion-input authority for the
logical source references, full bridge assertions, comparison member revisions,
null Purpose effective times. Supplied/unlinked variants are runtime interaction policy, not unused manifest declarations. Assembly reads
this file; bridge/source digests are computed from those actual declaration bytes.
It is a fixture proposal, not an adopted production codec.

Purpose snapshots are now literal canonical records in that fixture, referenced
by machine-readable purposeCases. They are never extracted from a rendered HTML.
unified.assemble.mjs is the checked discussion-only mapping from this declaration
to world-input, module import map, standalone HTML and computed receipt. Run from
the repository root with: node docs/proposals/atlas-purpose-ui-20261007/unified.assemble.mjs <absent-output-directory>.
It uses the existing UI exports; no CI/server/build framework is added. The
checked assembly and documentation define fixed digest byte domains; the algorithm is not a selectable fixture parameter. The assembly's generated runtime object
is consumed unchanged by unified.example.mjs. UI production admission remains
outside this recipe's scope.

unified.example.html — app shell/template.
unified.example.mjs — discussion input projection/selection/compare host.
unified.overview.jpg / bridge.jpg / gap.jpg / removal.jpg / narrow.jpg —
unmodified actual JPEG browser captures.

Host: http://127.0.0.1:18186/atlas-unified-v6/index.html.
Assembly uses the existing packBrowserModules, resolveHistory and notices.
The HTML embeds the unchanged Activity fixture, valid Closure pairs, explicit
synthetic bridges/bases and a computed receipt; existing UI@3fd4519 supplies
193 packed modules. No new server/workflow/development CI.
Generated standalone HTML is non-authoritative, with source/input bytes bound
by the computed receipt.

## P readback

1280x720 and 500x800 outer viewport; narrow document client/scroll widths both485.
No reported console errors in the candidate.

- Initial: one canvas shows native scope/org/refs plus Purpose and two labelled
  synthetic bridges. Full bridge labels were brought above scope backgrounds.
- Actual SVG edge click on serves selects the bridge itself; qualified endpoints,
  note, authority=false, sourceRef/sourceDigest appear in the common detail/raw.
- Bridge input off: connector labels disappear; effective frame is unlinked and
  bridgeSource=null. Entities remain; no label/title inference restores a bridge.
- CEO -> Purpose -> Ideal -> Gap -> Fill -> Receipt -> Residual -> next Gap:
  traversed through the same selection/detail, including all top-level paths.
- Work w-render-3 -> contributes-to -> Fill: explicit relationship traversed;
  completed Work still leaves business Gap/Reduced Receipt/Residual.
- A before/after: source revisions switch together only as declared; selected
  qualified identity remains; Activity date and Purpose time unavailable are shown.
- Search t-purpose selects the Activity target, not Closure purpose.company.
- Named replacement after: selected gap.source is unlisted but its prior fields,
  path/raw/sources remain; no deletion/completion reason is invented.
- Narrow: fit may suppress labels; this is indicated. Search/list + select/focus
  or zoom permits reading the chosen item. One whole world is not claimed to have
  every label legible at phone-sized overview.
- Focus/zoom/fit are shared camera controls; no second graph or hidden mount.

Completion here means same-source P/R/W3 HTML agreement only.
Product source/admission/UNKNOWN recovery/voice impact/real OCI/merge/close remain
outside this discussion's completion and authorization.

## Authority precision for this exact discussion source

The fixture owns only consumed logical input. Repo roccho-dev/ui, adopted UI 3fd451996d05e304a38be2a6696acb18b3103a37 and raw Activity SHA sha256:2384739feea269334fb36cde1834ffbbf30b01014bcd9e0ff9ba301d3b582526 are source evidence for this fixed Git head, not declared runtime admission gates. The checked source and computed input/module/output receipt bind the actual reconstruction.
Bridge-input variants are defined by the checked runtime checkbox policy; effective frame IDs and bridgeSource reflect the supplied variant. Same-time is not a separate manifest boolean: all supplied Purpose effectiveAt values are null and the runtime states their absence. This is not a portable production source-admission contract.

The fixed discussion digest protocol is SHA-256 over UTF-8 JSON.stringify in published key order, no trailing LF. Bridge assertions are hashed before their generated sources are added. Purpose digests hash the chosen literal record array. Basis digests hash the derived comparison arrays after activityAsOf, purposeDigest and bridgeSource, excluding basisSource itself. Activity channel digests hash exact resolved text bytes without reserialization. These rules describe the checked implementation; they are not unused input options.
The assembler consumes authority=false, bridge authority=false and null purposeEffectiveAt as current-example constraints and rejects unsupported authoritative/time-provided examples. sameEffectiveTime in the runtime basis is derived from supplied frame data, not an ignored fixture declaration.
