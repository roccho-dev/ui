# Atlas application-usecase example

This example proves the reusable UI capability needed by the Live Agent Organization Atlas application.

```text
AtlasApp     = AppSourceAdapter + SharedAtlasUI
AtlasExample = FixtureAdapter   + SharedAtlasUI
```

Both consumers pack and execute the same `packages/control/atlas-ui.mjs` screen, the same Live Atlas read-model/projection, and the same semantic-map/maxGraph primitives. The fixture adapter never copies the screen.

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
| history / timeline | revision slider, gap, create/activity change, ref retarget and topology/status change |
| camera / LOD | Fit, wheel zoom, pan, far→middle→near, near work evidence |
| currentness | current, rejected/disconnected UNKNOWN, accepted recovery |
| closure | offline single-file module closure using the same SharedAtlasUI subset as the app artifact |

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

The artifact still boots `packages/control/atlas.mjs` and the shared `packages/control/atlas-ui.mjs`; there is no a2-only renderer or screen.

The fixture exists only to prove:

- explicit Purpose / Projects+Work / Agents presentation areas;
- qualified entity and relation identities;
- Agent×Work p/r/w relation context;
- one Work node with many-to-many explicit relations;
- Now / Recent / UNKNOWN, source/time/coverage and before/after differences;
- recoverable aggregate and omitted relation identities;
- SVG-visible routine judgement without relying on the legacy Inspector/audit/catalog surface.

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

## Issue / Package extension — implementation review

The vocabulary adopted in [#338](https://github.com/roccho-dev/ui/pull/338#issuecomment-6050146603) is being materialized on the current [#336](https://github.com/roccho-dev/ui/pull/336) world, starting from `768e829ee893a565676ea99387178b1624eb9783` (stacked on #335). The initial commit adds this plan only; `input/a2-world.json` does not yet contain the new Issue / Package example.

The dedicated Draft PR is the discussion and implementation record. Fixed W will take fixed R / P counterexamples there before changing the fixture and its existing composition gate.

Planned small extension:

- Add explicitly synthetic Issue, Package and Repo records to the existing world input. Preserve existing Project / Work identities and the Purpose-left / Agents-right presentation.
- Supply many-to-many Issue / Package relations, independent evidence on the same endpoints, and explicit proposed Repo / Package containment. A before/after placement change must keep the same qualified Package identity.
- Keep required responsibility / I/O, implementation-unknown, placement, and proposal provenance distinguishable through existing labels, flags, source and relation context. Entity summaries alone are insufficient because the current SVG judgement does not display them.
- Extend the existing composition gate with real SVG selection, readable Issue / Package identification after selection / Focus, relation-evidence recovery, the explicit path to Purpose, nested geometry, and history / placement-difference checks. Retain the existing containment, p/r/w, currentness and Focus / Fit checks.
- Reuse the public app build and full-snapshot SSE consumer above. P owns generation, hosting, shared HTML or PNG evidence, and real localhost interaction with the existing Git-untracked finite SSE simulator. Reusing that simulator on the future exact head remains to be verified.

This plan adds no production owner contract, required relation taxonomy, acquisition mechanism, dependency, CI workflow, or Judgement redesign. Source review, executable checks and P's real-screen evidence for the implementation head remain pending; prior #336 results do not establish this extension's completion.
