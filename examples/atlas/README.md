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
- the one World screen (three areas, status and search rows) without relying on the legacy Inspector/audit/catalog surface.

Pure World input/containment/fixture contracts run without browser dependencies through `node tests/check-atlas-world.mjs`, also included by `tests/run-all.mjs`. The browser gate below owns public-HTML rendering and interaction checks; it does not duplicate those pure assertions.

For the executable product proof, run:

```sh
nix develop .#semantic-map-browser-proof --command \
  node tests/atlas-a2-ui-composition-gate.mjs --out=<fresh absent directory>
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

Each box shows its supplied label (and, for a Gap World, the state, causes
and provenance lines the gap view draws). A record's other fields are not
drawn on the one screen; the search row finds every qualified entity and
relation of the frame shown, including hidden or over-budget ones, and
choosing a result brings its box into view (for a relation, a drawn end of
it). Relation labels are drawn when their line is long enough; the meaning of
every Gap relation is also in a box's own text.

### Relations and Purpose paths

The two new Work→Issue relations explicitly have `path=false`. They do not
replace the existing seven-entity Agent 1 → Work X → Fill X → Gap A → Ideal A →
Purpose A → Company purpose path. No ordinary relation implies containment.

### One placement proposal, two versions

Package A keeps `example-packages/package/pkg-a` in both frames. The synthetic supplier explicitly versions one placement proposal, keeping `example-relations/placement/pkg-a.repo-proposal` while changing its from/context/source:

- Before: Repo A, move-a-v1, fixture:place-a@1.
- After: Repo B, move-a-v2, fixture:place-a@2.

The supplier also explicitly declares **display containment for this proposal**, so Package A is nested inside the supplied Repo in each frame. Package B stays inside Repo A. This is not a general rule deriving containment, implementation existence or identity from repository placement. Step between the two frames with **◀ 前へ** / **次へ ▶** to see Package A move.

## Prepared comparison input (#342)

`input/prepared-comparison.json` is an additional **synthetic, authority=false**
input whose optional root `comparisons` array carries owner receipts (`id`,
`ownerRef`, explicit `before`/`after` endpoints, `axes`, `gaps`, `source`,
`time`, `flags`). The World contract reads them exactly and keeps them with a
held pair; the one screen does not draw them (contract 3, revised: no record
or comparison panel).

## The one World screen

A World page has one composition (adrs#647 comment 6305441262, contract 3
revised): the three areas, with two rows above them. There is no HUD, detail
panel, timeline strip or band.

- **Row 1, the status**: warnings first — **更新停止・最新か不明**, a refused
  input (**入力を拒否・前に受け付けた入力を表示中**), the stream state (SSE
  未接続 / 応答なし / …) — then **LATEST** or **HELD**, the frame shown
  (**表示中：現在 n/n** or **過去 i/n**, with its id) and the last receipt. A
  narrow window cuts only the tail of the row.
- **Row 2**: the search and its results, then **◀ 前へ**, **次へ ▶** and
  **現在へ**. ◀ 前へ shows the previous received frame and holds it: the three
  areas are drawn from that frame, and new input does not move it. 次へ ▶ steps
  toward the present; 現在へ returns to the latest and follows it again. A
  control that would change nothing is disabled, never hidden. The keys `[`
  `]` `L` are their shortcuts; no key acts without a visible control.
- **予定 ▸** opens the planned side of the latest frame, which is never a frame
  and never a fact: its plans (or 計画未宣言（UNKNOWN）), the plans bound to no
  ideal state, and the upkeep — per condition, when its observation goes stale
  — or, without `upkeep`, the next stale time alone. The three areas stay as
  they are.
- **仕訳 n ▸** opens the entries the frame shown carries: kind, time, author and
  source, one row each.
- The phase line names when its phase began; 理想状態 names the plans and the
  unbound plans; the phase box lists what was held.

Mouse drag and wheel pan the World; Ctrl/⌘ + wheel zooms. A World larger than
the view at scale 1 is panned, never shrunk until its text no longer fits; a
resize refits it without changing the frame or the selection.

### Rejected updates

The public app accepts the same input as real `snapshot` SSE events at `?events=`.
Malformed JSON or a World-contract violation is said first on the status row
while the last accepted input stays drawn; the held frame, selection, camera and
observation timestamps do not change, and the next valid snapshot clears it.
Disconnection exposes UNKNOWN for live activity; reconnecting does not
manufacture a new observation. Quiet World input has no periodic clock timer.

### Update stalled

A live World page (opened with `?events=`) says **更新停止・最新か不明** in its
status row, and qualifies LATEST as **LATEST（最新か不明）**, once the browser's
clock is more than three update periods past the newest frame's `asOf`. Heartbeats
do not clear it: they show the stream is open, not that the World advanced. The
period is the World's actual update period, and the build is its only source
(`--update-interval-minutes=<n>`, given by whoever runs the updates); there is no
default, and a build that names none never claims a stall. One timeout per
accepted World wakes the page at that moment, with no periodic timer. A sample
page (no `?events=`) claims no updates and never reads stalled.

Limit: the newest `asOf` is the time HQ read its current claims, so it advances on
every update that passes them. An update that passes no current leaves `asOf` at
the last ledger time, and such a World reads stalled after three periods even
while its updates still run.

### Checks

`node tests/run-all.mjs` runs the pure checks, among them
`tests/check-atlas-world-screen.mjs` (no HUD, panel, strip or band region; the
30-case wording table read from the drawn text). Inside the
`semantic-map-browser-proof` Nix shell, each browser proof takes
`--out=<fresh absent directory>` and writes nothing outside it (its temporary
files and the browser profile included):

- `tests/atlas-a2-ui-composition-gate.mjs`: this example's composition,
  nesting, actual-click selection, the held frame across updates, admission,
  resize, transport state and a gate-local SSE stream, as drawn;
- `tests/atlas-world-status-browser-proof.mjs`: the status rows, the time
  controls, 予定 ▸ / 仕訳 ▸ and search, by visible rectangles at 1500 and 800 px;
- `tests/atlas-world-regression-browser-proof.mjs --input=<World> --before=<page>`:
  a World against an earlier build of it, as drawn.

A PASS is UI evidence for the input given only. It is not evidence of real
acquisition, production SSE, observer coverage or Purpose achievement.
