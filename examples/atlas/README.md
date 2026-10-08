# Atlas application-usecase example

This example proves the reusable UI capability needed by the Live Agent Organization Atlas application.

```text
AtlasApp     = AppSourceAdapter + SharedAtlasUI
AtlasExample = FixtureAdapter   + SharedAtlasUI
```

The legacy app and the example both call `mountAtlasUI` in `packages/control/atlas-ui.mjs`, using the same Live Atlas read-model/projection. World input uses the separate `mountAtlasWorldUI` in that file with its own model/projection. Both mounts use the existing semantic-map/maxGraph renderer; the fixture adapter never copies either screen.

## Exact input

`input/example.jsonl` is a one-line deterministic fixture record containing:

- actual `ui.liveAtlasInput.v1` snapshots;
- a small accepted history with a revision gap;
- example-only scripted connection/snapshot steps with explicit times;
- provenance stating that this is synthetic UI evidence, not OCI activity or business authority.

The small dataset is intentionally chosen to retain the observable application-usecase capabilities: hierarchy, actor/org/member relations, work/parallel/status, references, Control/claim/pin, Inspector, search/audit, history/timeline, camera/LOD, UNKNOWN and recovery.

## Build

```sh
node scripts/build-live-atlas.mjs \
  --consumer=example \
  --input=examples/atlas/input/example.jsonl \
  --out=examples/atlas/dist
```

Generated output:

```text
examples/atlas/dist/
├─ index.html
└─ receipt.json
```

`dist/` is generated review output, ignored by Git and never source authority.

## Use

Open `dist/index.html` directly or through the repository's existing static host.

The shared Atlas screen starts on the deterministic sample history. The visible **fixture · synthetic** replay controls live in the shared top bar's normal flex flow, so they do not cover Search. Use **Next scripted update** to step through:

1. accepted/current live revision;
2. rejected update → UNKNOWN while the previous accepted revision is retained;
3. disconnected → UNKNOWN;
4. reconnect while the rejected attempt is still visible;
5. accepted recovery → current.

This bounded replay does not open EventSource and does not imply a real OCI producer.

## Capability evidence

| Application-usecase capability | Example action/evidence |
|---|---|
| hierarchy / org / membership | nested scopes plus actors/org/member rows; membership edge at non-far focused selection |
| work / state / refs | parallel running work, blocked/residual work, missing scope, purpose/meta/policy/code refs |
| SVG + HTML selection | maxGraph activation and scope/audit controls converge on the same selected id/focus |
| Inspector / Control | scope/actor/work/evidence plus one real Control/claim/pin join |
| search / audit | raw source rows, unknown producer property search, exact-id selection |
| history / timeline | revision slider, retained revision across the 64-entry window, visible expiry fallback, gaps, create/activity change, ref retarget and topology/status change |
| camera / LOD | Fit, wheel zoom, pan, far→middle→near, near work evidence |
| currentness | current, rejected/disconnected UNKNOWN, accepted recovery |
| closure | offline single-file module closure using the same SharedAtlasUI subset as the app artifact |

History keeps a selected revision while it remains in the 64-entry window. When it expires, the screen shows the oldest retained revision and names the expired one in the existing notices. Choosing another revision clears that notice; choosing latest resumes following updates. Derived layouts are retained only for history/held revisions, while gap evidence remains in the read model.

Large-scale 300-scope/readability/budget/rollback and real EventSource transport remain shared/application regression tests; the example does not duplicate those workloads.

## Relations

- Refs #322 — Atlas extraction/application-usecase witness
- Refs #328 — shared composable UI, no example-only screen
- Refs #327 — HTML shell + SVG spatial plane
- Related: roccho-dev/apps#66 — later application ownership handoff; no apps implementation is performed here

Historical v2 Graph/Seq witness remains partial evidence only.


## a2 three-area world input

Refs roccho-dev/apps#73 and the agreed a2 UI implementation boundary.

`input/a2-world.json` is a synthetic, authority=false example of the generic world read-model seam. It does not replace Purpose Closure, Activity, Project, assignment, or runtime owner contracts.

Build it through the same public application entry used by the Atlas app:

```sh
node scripts/build-live-atlas.mjs \
  --consumer=app \
  --input=examples/atlas/input/a2-world.json \
  --out=examples/atlas/dist-a2
```

The artifact boots `packages/control/atlas.mjs`, which selects `mountAtlasWorldUI` in `packages/control/atlas-ui.mjs`. This is a separate World screen with the shared maxGraph renderer, not the legacy Inspector/audit screen.

The World controller validates each new payload. Connection-only updates reuse its normalized input. World has no autonomous clock timer: explicit mount `tick(now)` records observation time without drawing. Payload, connection, frame, selection, camera and resize events still update the screen. Legacy live mode retains its timer and TTL-based currentness.

The fixture exists only to prove:

- explicit Purpose / Projects+Work / Agents presentation areas;
- qualified entity and relation identities;
- Agent×Work p/r/w relation context;
- one Work node with many-to-many explicit relations;
- Now / Recent / UNKNOWN, source/time/coverage and before/after differences;
- recoverable aggregate and omitted relation identities;
- SVG-visible routine judgement without relying on the legacy Inspector/audit/catalog surface.

Pure World input/containment/fixture contracts run without browser dependencies through `node tests/check-atlas-world.mjs`, also included by `tests/run-all.mjs`. The browser gate below owns public-HTML rendering and interaction checks; it does not duplicate those pure assertions.

For the executable product proof, run:

```sh
nix develop .#semantic-map-browser-proof --command \
  node tests/atlas-a2-ui-composition-gate.mjs
```

A PASS is UI composition evidence for this synthetic input only. It is not evidence of real Codex acquisition, apps admission, production SSE, observer coverage, or Purpose achievement.


## Explicit containment and nested presentation

The a2 world seam can explicitly declare physical nesting on an existing relation with:

`containment: "from-contains-to"` or `containment: "to-contains-from"`.

Only that field activates nesting. Relation kind/name, arrow direction, entity kind, Project membership, p/r/w, review/collaboration, process trees, and Purpose ancestry do not imply containment.

The current presentation is a single-node tree per area:

- duplicate evidence for the same qualified parent/child is valid and every relation ID remains evidence;
- one child with distinct qualified containment parents is rejected;
- self/cyclic/cross-area containment is rejected;
- arbitrary containment DAGs are not claimed;
- a hidden or budget-omitted parent never promotes its descendant to a flat root.

Nested bounds reuse the existing semantic-map graph layout with neutral temporary layout kinds. Source refs/kinds and relation source/time/context remain Atlas evidence.

The synthetic fixture proves nested witnesses in Purpose, Projects + Work, and Agents while Work X remains one node across two ordinary Project memberships. This is UI capability evidence only; no production Purpose/Project/assignment adapter or real apps acquisition is claimed.

## Synthetic Issue / Package example

[User's materialization GO](https://github.com/roccho-dev/ui/pull/338#issuecomment-6050146603), [adopted vocabulary](https://github.com/roccho-dev/ui/pull/338), and [the implementation discussion](https://github.com/roccho-dev/ui/pull/339#issuecomment-6050579119) define this bounded example. It extends the current #336 world on #335 through the same public entry, builder and renderer.

`input/a2-world.json` contains two frames with 25 entities each. It retains the original 19 records and their relations, and adds six explicitly synthetic proposals: Issue A/B, Package A/B and Repo A/B. The center area's id remains `projects`; its presentation label is now **Scopes**. Existing Project / Work identities, labels and relations are preserved.

The new records have unknown observed/acquired/effective time. Coverage remains partial. Package flags say **implementation-unknown**, independently of activity UNKNOWN. None of these records is an observed implementation, an adopted business relation, or proof of completion.

### Read the supplied meaning

Start in **After**. Actual node selection shows its qualified identity and flags. Use **Focus** (F) to read a short label, then focus the SVG and use **Fit** (0) to return. Fit can compact leaf labels; a hidden label or an internal record count is not proof of readability.

| Meaning | Select in the SVG | Read |
| --- | --- | --- |
| Separate Issue identities | Issue A, then Issue B | `example-issues-a/issue/7` and `example-issues-b/issue/7`. A has two supplied Work links; B has none in this partial fixture. This does not prove real Work absence. |
| Package A requirement | A→A relation, then its aggregate member `pkg-a.issue-a.req` | role=plan, input=Request, output=Plan, basis=req-a, source fixture:req-a@1 |
| Independent A→A evidence | Same aggregate's `pkg-a.issue-a.alt` member | basis=alt-a, source fixture:alt-a@1. Recover both refs; drawing one aggregate does not adopt or merge their evidence. |
| Package B requirement | B→A relation `pkg-b.issue-a.req` | role=render, input=Plan, output=SVG, basis=req-b |
| Implementation evidence | Package A or Package B itself | `implementation-unknown` in Flags. Package selection does not display a related record's context; requirements above are read on the specified relations. |
| Proposed relation to Issue B | A→B relation `pkg-a.issue-b` | from=Package A, to=Issue B, basis=scope-b, synthetic/proposal |
| Proposed placement | Placement relation `example-relations/placement/pkg-a.repo-proposal`, Before / After | repo=Repo A / Repo B, basis=move-a-v1 / move-a-v2, source fixture:place-a@1 / @2 |

All required context values are shorter than the current 32-character value limit. Distinguishing evidence is in short basis/sourceRef values, not only in a hidden summary or sourceDigest. Relation label A→A/A→B/B→A abbreviates the named Package→Issue pair; all three are ordinary graph relations.

### Relations and Purpose paths

Relation selection's **Direction starts from the relation's source**. It does not promise to traverse the selected edge. In this example, selecting A→B can still show Package A → Issue A → Purpose A → Company purpose. That is not evidence of a path through Issue B.

To follow B, click the exposed A→B line, read its selected ref and endpoints, then **click Issue B itself** and read Issue B → Purpose A → Company purpose. For A→A and B→A, click the relation and then Issue A to read A's own Purpose path. Package A selection also exposes one supplied path through Issue A, without adopting either A→A evidence record.

The two new Work→Issue relations explicitly have `path=false`. They do not replace the existing seven-entity Agent 1 → Work X → Fill X → Gap A → Ideal A → Purpose A → Company purpose path. No ordinary relation implies containment.

### One placement proposal, two versions

Package A keeps `example-packages/package/pkg-a` in both frames. The synthetic supplier explicitly versions one placement proposal, keeping `example-relations/placement/pkg-a.repo-proposal` while changing its from/context/source:

- Before: Repo A, move-a-v1, fixture:place-a@1.
- After: Repo B, move-a-v2, fixture:place-a@2.

The supplier also explicitly declares **display containment for this proposal**, so Package A is nested inside the supplied Repo in each frame. Package B stays inside Repo A. This is not a general rule deriving containment, implementation existence or identity from repository placement.

Select Package A and use Before / After: the selected ref survives and Diff shows changed containment. Read the named Repo by clicking its boundary and using Focus, then return with Fit. Selecting the same placement relation across frames shows the concrete Repo/version context and changed from, context, source rather than a missing counterpart.

### Reproduce and assess

Use the a2 public build and existing Nix composition-gate commands above from the exact implementation head, with a fresh output directory. The builder writes `index.html` and `receipt.json`; retain the input SHA256 and HTML SHA256/bytes with the head. No generated output is source authority.

The existing browser gate retains its rendering and interaction assertions, while pure input/fixture assertions live in the Node check. It covers actual node/edge clicks, the three M:N routes, both independent A→A evidence members, readable context/flags and Focus labels, and Package identity/nesting across frames. It requires an exposed rendered edge click point; DOM text or a covered midpoint is insufficient. Its placement-relation diff probe uses programmatic selection and is distinct from its actual Package/Repo/frame clicks.

P independently obtains the published head and owns the existing Nix gate, HTML generation/hosting, shared HTML or PNG, localhost clicks, and the existing Git-untracked finite SSE simulator. Feed that simulator this exact input through the same full-snapshot consumer; check updates, Before hold / After return, selection, disconnect UNKNOWN and reconnect. Gate `setSession` probes are not actual EventSource transport evidence. R judges the exact head and its corresponding results independently.

The three real-data unknown groups remain: source/identity mapping; requirement/implementation evidence; and relation owner/meaning/evidence/adoption/coverage. This example introduces no required relation taxonomy, owner codec, acquisition mechanism, dependency, CI workflow, second screen or Judgement redesign. Published source and executable proof, P's real-screen/SSE readback and R's verdict are separate evidence; prior #336 results do not establish this example's completion.
