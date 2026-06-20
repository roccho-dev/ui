# Purpose Decision Atlas v6 — A2UI + latest source UI

A2UI版のstate/action/runtimeを基盤にし、**最新の非圧縮source HTML**をUIの正本として、UI-refactor版JavaScriptの描画改善を取り込んだ統合版です。

この成果物では、次の2つを分離しています。

- **golden**: `golden/source/ui-shell.html`、`ui.css`、`ui-renderer.js`、`model-core.js`
- **candidate**: A2UI v0.9 DataModel/actionと、`CachedAtlasRenderer`で動く統合版

candidateはgoldenと同じ見た目であるだけでなく、t0〜t40の意味投影、desktop/mobileの画面、操作、描画cache不変条件を自動比較して合格した状態を同梱しています。

## 成果物

```text
dist/purpose-atlas-v6-a2ui-ui-refactor.preview.html
    A2UI runtime、surface JSONL、CSS、bundleを内包した単一HTML

dist/index.html + dist/assets/* + dist/a2ui/*
    通常のVite production build

golden/source/*
    UI正本とした最新sourceを非圧縮のまま保存

evidence/golden-witness.json
    golden/candidateの意味・画面同値証跡

evidence/browser-verification.json
    desktop/mobileのA2UI action・選択・cache・操作検証
```

## 取り込んだJS改善

`src/ui/cached-atlas-renderer.js`に次を統合しています。

- offscreen `worldSurface`へ地形と静的graphをcache
- `atlasScene`と`atlasOverlay`の2 canvas構成
- pan/zoom時はworld cacheをblit
- hoverはoverlayだけを更新し、scene cacheを再生成しない
- `pointermove`を`requestAnimationFrame`で集約
- DPR上限をdesktop 2、mobile 1.5へ制限
- mobileは選択時だけInspectorを前面表示
- responsibility ringのhit testと選択経路強調

UI構造、文言、responsive CSSは最新sourceを基準に維持し、A2UI側では1つのallowlisted custom componentとして登録しています。

## Golden / witness結果

`npm run verify`で以下を再実行します。

| witness | 合格条件 | 同梱結果 |
|---|---|---:|
| source integrity | golden sourceのSHA-256一致 | PASS |
| canonical data | nodes / edges / events hash一致 | 26 / 27 / 40 PASS |
| semantic replay | t0〜t40、11項目を完全一致 | 41 / 41 PASS |
| desktop visual | 1440×1050、SSIM ≥ 0.999 | 0.999954 PASS |
| mobile visual | 390×844、DPR 2、SSIM ≥ 0.999 | 0.999955 PASS |
| DOM text | 17要素の文言一致 | exact PASS |
| DOM geometry | 最大差 ≤ 0.1px | desktop 0.062px / mobile 0.032px |
| browser behavior | A2UI action、ring選択、dedupe、zoom、遷移 | desktop/mobile PASS |
| cache invariant | hover前後でscene build数不変 | PASS |
| console/page errors | 0 | PASS |

意味比較の対象は次の11項目です。

```text
t
currentPurpose
guard
guardText
nextOwner
visibleNodes
visibleEdges
roleNodeCount
responsibilityComposition
lastEvent
metaOrder
```

全41投影の結合hashは、`evidence/golden-witness.json`と`evidence/semantic-projections.json`に保存されています。

## 実行

```bash
npm ci
npm run dev
```

production build:

```bash
npm run build
npm run preview
```

単一HTMLは次です。

```text
dist/purpose-atlas-v6-a2ui-ui-refactor.preview.html
```

## 検証

```bash
python3 -m pip install -r requirements-verify.txt
npm ci
npm run verify
```

検証は以下を順に実行します。

```text
14 Node contract/domain tests
A2UI v0.9 JSONL strict validation
Vite production build
static architecture verification
real-browser interaction verification
latest source golden/witness verification
```

この環境ではChromiumを`/usr/bin/chromium`から起動します。別の場所にある場合は、Python検証スクリプトの`--chromium`引数で指定できます。

## A2UI構成

```text
public/a2ui/purpose-atlas.surface.jsonl
  └─ AtlasSourceSurface
       ├─ snapshot        /atlas
       ├─ step            /ui/step
       ├─ viewMode        /ui/viewMode
       ├─ viewport        /ui/viewport
       ├─ selection       /ui/selection
       └─ 15 allowlisted actions
```

```text
A2UI JSONL
  → MessageProcessor
  → Surface DataModel
  → AtlasSourceSurface
  → CachedAtlasRenderer
  → A2UI setter/action
  → AtlasRuntime reducer
  → pure atlas-engine projection
  → updateDataModel
```

A2UI JSONには実行可能なJavaScriptを含めません。地形描画は、クライアントに事前登録された`AtlasSourceSurface`だけが実装します。

## ディレクトリ

```text
public/a2ui/purpose-atlas.surface.jsonl  surface / binding / action declaration
src/a2ui/                               catalog、schema、security validator
src/runtime/atlas-runtime.js            A2UI action reducer / DataModel publish
src/domain/atlas-engine.js               pure replay / guard / layout / responsibility
src/components/atlas-source-surface.js   latest source UIのLit実装
src/ui/cached-atlas-renderer.js           cache描画とinteraction
src/styles/source-ui.css                  latest source CSSのShadow DOM適応版
src/data/atlas-data.json                  canonical graph + 40 events
golden/source/                            latest uncompressed source UI
golden/GOLDEN_LOCK.json                   golden hashと比較policy
scripts/verify_golden.py                  semantic + visual witness
scripts/browser_verify.py                 A2UI browser behavior witness
evidence/                                 実行済み証跡
```

## 固定バージョン

```text
A2UI protocol       v0.9
@a2ui/web_core      0.10.1
@a2ui/lit           0.10.1
lit                 3.3.3
zod                 3.25.76
vite                8.0.16
esbuild             0.28.1
```
