# A2UI + latest source UI 統合設計

## 1. 基準

UIの正本は、ZIP内の生成HTMLではなく、非圧縮sourceにある最新の次の4ファイルです。

```text
golden/source/ui-shell.html
golden/source/ui.css
golden/source/ui-renderer.js
golden/source/model-core.js
```

`golden/GOLDEN_LOCK.json`が各ファイルのSHA-256、canonical data hash、semantic/visual比較条件を固定します。

## 2. Before / After

| 関心 | latest source UI | 統合後 |
|---|---|---|
| 画面構造 | `ui-shell.html` | 同じ構造をLit templateとして保持 |
| responsive style | `ui.css` | Shadow DOM向けにroot selectorだけ適応 |
| state | closureのmodel | A2UI DataModel |
| action |個別DOM handler | 15種のA2UI action |
| domain projection | `model-core.js` | pure `atlas-engine.js` |
| static terrain | offscreen canvas cache | `CachedAtlasRenderer.worldSurface` |
| interaction | scene + overlay | 同じ2 canvas構成 |
| pointer | rAF集約 | rAF集約を維持 |
| validation | source browser test | source-vs-candidate golden/witness |

## 3. A2UI境界

A2UI JSONLは1つのcustom componentだけを宣言します。

```text
AtlasSourceSurface
  input:
    snapshot / step / maxStep / playing / viewMode
    viewport / selection / events / operations / toast
  output:
    15 allowlisted A2UI actions
    DataModel setter for step/viewMode/viewport/selection
```

UIを1 componentにした理由は、latest sourceのCSS grid、2 canvas、Inspector、timelineを同一layout contextで保持し、goldenのgeometryを変えないためです。A2UIの状態・action境界は失われず、surface JSONLとstrict schemaで制御されます。

## 4. 描画改善

```text
CachedAtlasRenderer
  ├─ worldSurface       terrain + static graph cache
  ├─ atlasScene         cache blit / pan / zoom
  └─ atlasOverlay       hover / selection / labels / focus path
```

不変条件:

1. hoverは`sceneCacheDirty`を立てない。
2. pointermoveは1 frameに集約する。
3. stepまたはmode変更時だけstatic worldを再構築する。
4. pan/zoomでは原則cacheをblitする。
5. archive visibility bucketが変わる場合だけworldを再構築する。
6. DPRはdesktop 2、mobile 1.5を上限とする。
7. mobile Inspectorはselectionがある場合だけ表示する。

## 5. 表示モード

| mode | source UI上の表示 | 動作 |
|---|---|---|
| `purpose` | 目的 | 目的距離とsupport pathを優先 |
| `responsibility` | 責務 | recursive responsibility ringを優先 |
| `focus` | 選択経路 | 選択node/actor branchだけを強調 |

座標はmode間で変えません。

## 6. Golden / witness

### Semantic witness

original sourceとA2UI candidateを同一Chromiumで起動し、t0〜t40を順に投影します。次の11項目をcanonical JSONとして完全比較します。

```text
t, currentPurpose, guard, guardText, nextOwner,
visibleNodes, visibleEdges, roleNodeCount,
responsibilityComposition, lastEvent, metaOrder
```

### Visual witness

同一ブラウザ・viewport・DPR・reduced-motion条件で、sourceとcandidateをfresh renderします。

```text
desktop 1440×1050 DPR 1
mobile   390×844  DPR 2
state    t7 / responsibility
```

合格条件:

```text
SSIM                    >= 0.999
pixels channel delta<=15 >= 99.9%
17 key element texts      exact
max element box delta     <= 0.1px
console/page errors       0
```

### Behavioral witness

- A2UI surface/DataModel生成
- `atlas.next` dispatch
- responsibility ring hit test
- selectionのDataModel writeback
- operation duplicate suppression
- t39/t40 purpose transition
- zoom round-trip
- hover前後のscene build数不変
- desktop/mobileともconsole error 0

## 7. 信頼境界

```text
untrusted JSONL
  → A2UI v0.9 schema
  → exact catalog ID
  → strict component property schema
  → action allowlist
  → DataModel path allowlist
  → MessageProcessor
```

JSONLには`call`、`functionCall`、HTML、scriptを許可しません。Canvasロジックはクライアント側catalogへ事前登録されています。
