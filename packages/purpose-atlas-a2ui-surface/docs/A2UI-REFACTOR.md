# A2UI徹底リファクタリング設計

## 1. Before / After

| 関心 | 旧構造 | 新構造 |
|---|---|---|
| 画面構造 | HTMLへ固定記述 | A2UI `updateComponents` |
| 状態 | closure/global mutable state | A2UI `DataModel` + runtime-owned state |
| DOM更新 | `getElementById().textContent`等 | dynamic path binding |
| イベント | 個別`onclick` / `addEventListener` | A2UI `Action` + action handler |
| timeline | DOM tick生成と直接handler | `step` binding + `atlas.stepChanged` |
| Inspector | `innerHTML`と再bind | declarative Lit template + bound data |
| 選択 | canvas-local objectのみ | `/ui/selection`へtwo-way binding |
| viewport | canvas-local numeric state | `/ui/viewport`へtwo-way binding |
| 記録 | ad-hoc object | reducer + deterministic dedupe key |
| domain | UI script内へ混在 | pure `atlas-engine.js` |
| protocol | 独自 | A2UI v0.9 |

## 2. 責務分割

### JSONL

- surface creation
- component tree
- property bindings
- user action declarations
- initial state

### web_core

- message processing
- surface/component state
- data subscriptions
- action context resolution
- client capability / client data model generation

### runtime

- action reducer
- play timer
- operation dedupe
- domain snapshot publishing

### domain

- event replay
- support graph traversal
- purpose contract validation
- deterministic placement
- recursive responsibility aggregation

### component

- presentation
- local pointer gesture interpretation
- A2UI setter/action invocation

## 3. 不変条件

1. roleを独立nodeとして追加しない。
2. node kindや役職名でlayout algorithmを分岐しない。
3. current purposeをmeta rank 0の基準にする。
4. responsibilityはsupport subgraphから再帰集約する。
5. timelineの40 eventを維持する。
6. 同じ操作記録を再作成しない。
7. JSONへ実行可能コードを埋めない。
8. domain engineはDOMを参照しない。

## 4. 画面モード

| Mode | 主眼 |
|---|---|
| `all` | 目的・責務・証拠を統合表示 |
| `purpose` | purpose / milestoneとsupport pathを優先 |
| `responsibility` | 責務リングとactor branchを優先 |
| `risk` | current purpose・missing requirement・関連edgeを優先 |

位置を切り替えず、同じメンタルマップ上で強調だけを変えます。

## 5. CanvasとA2UIの境界

Canvasはcustom catalog componentです。JSONから渡るのはsnapshot、viewport、selection、viewMode、actionだけです。

```text
A2UI DataModel  ──> AtlasCanvas props
AtlasCanvas     ──> setViewport / setSelection
AtlasCanvas     ──> atlas.select action
```

Canvas内部の60fps pointer feedbackまで毎回server actionにせず、selection確定時だけactionを発火します。これによりprotocolの意味を保ちながらpanの遅延を避けます。

## 6. 次にserverへ接続する場合

現在の`AtlasRuntime`をagent transport adapterへ置き換えます。

```text
A2UI client action
  → API / A2A transport
  → authorization + domain command
  → server projection
  → A2UI updateDataModel / updateComponents
```

component JSONとdomain snapshotの契約はそのまま利用できます。

## 7. 信頼境界とvalidation

```text
untrusted JSONL
  → A2UI v0.9 schema
  → exact catalog ID
  → component API strict schema
  → action allowlist
  → DataModel path allowlist
  → MessageProcessor
```

`src/a2ui/apis.js`をsingle source of truthとして、component実装とJSONL validatorが同じproperty schemaを参照します。未知action、相対path、Atlas外path、未知property、`call` / `functionCall`はsurface生成前に拒否します。
