# Atlas Purpose / one-world proposal — current discussion entry

This directory is a **discussion proposal**, not product or business-contract authority.
The current entry is intentionally small:

- [unified.md](unified.md) — discussion canonical specification: comparison invariants, authority boundaries, one-world interaction, and normalization correspondence.
- [unified.input.example.json](unified.input.example.json) — one logical input for this reproducible discussion example. “One input” does not mean one producer; it can bind multiple source domains/revisions.
- [unified.assemble.mjs](unified.assemble.mjs) — deterministic input → standalone artifact + receipt reconstruction.
- [unified.example.mjs](unified.example.mjs) / [unified.example.html](unified.example.html) — the checked interaction source/template.
- `unified.{overview,bridge,gap,removal,narrow}.jpg` — actual browser evidence for the current example.

Current normalization baseline: `b36f5b031d99e1e70fd1ea03e599bb23f08af563`.
The existing assembler baseline is 2,580,901 HTML bytes, SHA-256
`fc3ad305a53679b56cf26ce8a8a2cf1bb1e904532677ac581b364862a7324820`,
with 193 packed modules.

## Current comparison invariants

The current proposal preserves these meanings; details and correspondence live in
[unified.md](unified.md).

```text
N+/N-  = qualified entity presence only
MΔ     = owner-defined declared meaning change
RΔ     = owner-defined typed-reference change
E+/E-  = owner-defined explicit relation presence/meaning change
SΔ     = source/evidence change
TΔ     = supplied temporal-metadata change
```

The axes are distinguishable but not mutually exclusive: one source change may
produce changes on more than one axis. Their counts are never summed into a
fictitious total progress or Purpose-achievement score.

```text
G(F)      = owner typedCompare(Ideal(F), Current(F))   # business Gap
D(F0,F1) = declared Frame comparison                  # world/frame delta
ObsGap    = acquisition/history completeness gap      # not business Gap
```

Unknown effective time stays unknown. Work/Receipt completion does not imply
Purpose achievement. “Unlisted in this Frame” does not imply deleted/completed;
the counterpart and reason-unknown state remain readable.

Relation identity is owner-defined. The historical discussion implementation
`[space, kind, from, to]` edge tuple and `parts()` field classification are
examples for this fixture, not generic production comparator laws. Independent
RelationRefs/context must not be collapsed merely because endpoints/kind match.

## Authority and cleanup boundary

`unified.md` is the **discussion canonical specification** for this proposal
directory only. It does not replace apps business contracts, the current a2 world
seam, owning production adapters, or other product authority.

Historical files remain in the tree during this first normalization slice.
They may leave the canonical surface only after the correspondence is closed:

```text
old invariant
→ discussion canonical section
→ logical input
→ deterministic reconstruction/runtime
→ interaction/oracle
```

File-count reduction, image moves, or renames are not completion criteria.
A historical file with unique live semantics stays until that semantic content is
absorbed and proved. The older entries below are retained as history and are not
current implementation requirements.

## Historical discussion log — retained, not current requirements
## P local readback — v1 illustration

同じHTMLをIABで操作、viewport 1280×720、画像はfull-page capture。CI生成なし。
- 初回: 10 records、selected residual.source、nextは未割当、最上位まで2 paths。
- 後着切替: 13 records、同じ選択を保持、追加3/変更1/削除0/追加関係4。
- 次へgap.source: Current/Ideal/declared delta/owner/proofを同時に読め、目的まで1 path。
- 初回撮影時に矢印先端がnode内へ隠れる計算とopaque IDだけのcaptionを発見し、
  local illustrationのgeometry/meaning labelを是正して再撮影。product sourceは変更していない。
- rawはHTML内のdisclosureとして用意。完了/authorityへの昇格なし。
- [Gap選択画像例](view.gap.jpg)。上流後着・他のdiff種別・実UI reuseはまだこの例で証明しない。

User指定の議論専用Draft。製品実装・CI変更・merge・Issue closeのGOではない。
P/r/w3の主張・反証はこのPRのConversationへ直接置く。

## Purpose / source
現在のarchitectureを維持して、目的→Gap→仕事→結果→残件→次Gapと、
before/afterの差をUserが同じ画面で辿れるところまで閉じる。
- UI採用: roccho-dev/ui@3fd451996d05e304a38be2a6696acb18b3103a37 (#332)
- apps契約採用: roccho-dev/apps@2022a8da358979b6360ef06795856b91b157185b (#69)
- #321/#322/#328/#327のowner境界を保持。apps#68のfirst sliceと次の表示phaseを分ける。
- P=root、r=6ac42ac0-36c4-83ee-b8f9-f82b3d69c310、
  w3=6ac48f50-a850-83ee-8439-557201ac3856。新actorを増やさない。

## Visual discussion material
[HTML例](view.example.html)、[before 画像例](view.before.jpg)、[after 画像例](view.after.jpg)。
HTMLと画像はPがローカルの実ブラウザで操作・撮影する。議論の生成にCIを頼らない。
既存repoが自動実行するCIを新たな可視化経路・完成証拠へ読み替えない。

これらは**表示意図のmockup**。既存UI Partsへの接続・reuse・完成のproofではない。
手書きSVG/DOMをproduct rendererへ昇格・コピーしない。完成実装は実在UI public
input/interfaceをinventoryしてreuseする。画像は固定状態、HTMLは操作/DOMの議論に使う。
合成データは採用apps reducerの実JSONLから取り、beforeは未割当next、
afterは後着のCurrent/Gap/Fillと同じResidual IDのnextを合流したもの。
authority=false。purpose達成をreceiptや色から推測しない。

## P observable claim
1. 空間図とInspector/履歴の現在の体験で目的経路を辿る。説明リンクだけにしない。
2. Gap: Current / Ideal / declared delta / owner / proofを同時に区別。
3. Fill→対象Gap、Receipt→Fill/evidence、Residual→receipt/nextを選択で辿る。
4. before/afterで追加/削除/変更・関係の追加/撤回をlabel/legendでも区別。
5. same-ID selectionを保持。消失を明示。business Gapとrevision gapを分離。
6. raw/sourceをHTML内で読める。IABのtxt navigation failureを解消する入口を計画する。
7. 上流後着と未割当next→次Gapの2ケースを既存IDのまま実証。
8. 設計対象は全agent/project activityの現architectureとのmeaning接続。
   fake Scope/Agentへの押込みや観測していないbusiness状態の創作をしない。

## Ownership and equations
apps: owning projectionのjoin、domain relation導出、snapshot比較、consumer adaptation。
ui: generic input/Parts/DOM+SVG/surface/camera/selection。UI→apps依存とrendererコピー0。

N+ = ids(after) - ids(before)
N- = ids(before) - ids(after)
NΔ = same IDs with changed declared fields
E(s) = typed referencesから導出する関係
E+/- = E(after)-E(before) / E(before)-E(after)

1枚のreducedにhistoryを捏造しない。validな前後2枚と明示順序を供給する。
Gap.deltaはsource宣言。達成率を文章/件数から推測しない。
parents=[]は既知joined graph内のroot、next=[]は未割当。
business receipt closedはPurpose達成ではない。

## Expected physical proposal
W3は実在distribution/public import/input/entry/buildを直接inventoryし、
小さな完成形dirtreeに各pathの+/~/0、owner/数式/DOM対応を書く。
採用closure/reduce/既存UI capabilityを再実装せず、必要なadapter/diff/consumerだけを
候補とする。既存SharedAtlasUIの適合は未証明なので名前だけで固定しない。
examples = UI capability for application usecaseを保持する。

Rは上記意味・既存architecture・最小性と実DOMの予測を独立反証。
全員DOM/geometryを計算できるが、実画面readbackはPが担当する。
R/W3は「目視した」と代作せず、source/DOM oracle・期待を自分で記録する。

## Closed loop / proof
同版合意 → bounded実装 → 同じproduction buildのHTML →
Rのsource/DOM独立検証 → Pの同じ入口の実操作 →
exact反例ならW3へ戻る → 未達0をHumanへ提出。

P readbackはartifact/input/状態/viewport/選択/操作、期待と実際、screenshot、
PASS/FAILをPRへ直接書く。画像だけでinteraction成功にしない。
Node: relation・全Purpose経路・snapshot差分・raw/input保全。
Build: actual公開UI consume、二重実装0、input→HTMLのidentity。
DOM/browser: 7意味・refs・切替・selection・legend・geometry・affected regressions。
P: purpose path、Gap詳細、2差分ケース、raw表示、代表Fit/zoom/selection。
PでRedならR技術Greenを消さずに区別し、完成扱いにしない。

## CI debt boundary
今回の議論はlocal HTML/画像＋P readbackで成立させる。
新dev workflow/job/server/dispatcher/台帳/CI fixture専用画面は作らない。
後続の必要CIは既存ownerの最小affected checksと標準artifact/retentionを先に検討する。
HTMLを操作対象、画像は補助。同じbuild入口を使い、CI-onlyの別rendererを作らない。

## Non-scope and permission
今回: docs/visual illustrationとPR上の三者反復のみ。
product source/CI/registry変更、apps#66全面移行、real OCI収集、merge、closeは未GO。
#329のP案は履歴。ここではUser訂正後のこのv1だけを議論の起点とする。


## Visual clarification v2 — R/W3反証をreadbackへ反映

関係R(kind)、business意味M、sources Sを分離する。
M(n) = declared node fields - typed references - sources。
E(s) = typed references。SΔは監査でありbusiness変更数へ合算しない。
今回afterはnode追加3／意味変更0／relation追加4／参照更新record1／source更新1。
「↗ 参照更新」と「~ 意味変更」を別legendにした。Pが同じviewportのHTMLで実確認。

画像はvisual v2へ更新。上のv1 readbackは当時の経過記録で、raw-record変更1をbusiness意味変更へ流用しない。
Purpose図は依然として表示意図の例。Activity同居・実entry/build・実UI consumeの全体設計は
#333のP 6025279917に従い反復中。CI生成・製品実装・採用GOは追加しない。


## Visual clarification v3 — independent replacement / counterpart detail

HTMLへ2つ目の比較caseを追加。採用reducerで有効な13-record snapshotと10-record snapshotを
独立したordered pairとして比較する。oldReduced+omissionによる削除とは主張しない。
Pのactual操作: replacement caseのbeforeでgap.sourceを選びafterへ切替。
追加0／未掲載3／意味変更0／relation追加0／relation未掲載4／RΔ1／SΔ1。
同じselected IDを保持し、graphには存在しないがdetailにbeforeのlabel/kind/fields/raw/sourcesを残す。
「このsnapshotに未掲載・理由未提供」「before snapshotの保持された内容」を明示。
[不掲載/参照撤回の画像例](view.removal.jpg)。画像はPのlocal actual capture、CI生成なし。
起動時にcase配列の初期化順エラーを実ブラウザで発見して是正し、再操作後に撮影。

全体設計はP 6025725543の単一admission・可視縦積みを基準にR/W3反復中。
この例はPurpose部分の議論資料で、Activity同居/production UI reuse/完成証拠ではない。


## Current candidate — design v4 / named replacement

[完成形tree・数式・DOM・検証・閉包](design.md)が現在の同版候補。
W3のactual UI ID max240 / reserved @mount / label max120に合わせ、
全comparison casesのbusiness IDs/edge tuplesをcompact UI-only IDsへ一意に写し、
full IDs/labels/rawをapp context/detailへ保持する。
production buildは単一Nix atlas-dist、separate build.mjsを削りpurpose-panelを分ける。
replacement fixture追加後の予定apps差分は11 paths。

[明示synthetic replacement入力例](current.replacement.example.jsonl)を新たに供給し、
adopted reducerで purpose + replacement を独立validate/canonicalizeした。
これはv3のpair反転を後続sourceへ昇格したものではない。
sourceRef=fixture:current-replacement@1、sourceDigestはactual pre-join payloadから生成。
P actual v4 readback: N-3 / E-4 / MΔ0 / RΔ1 / SΔ5（新replacement provenance）。
[更新したreplacement画像](view.removal.jpg)。残るcounterpart fieldsと理由未提供を確認。
旧v3の反転例は履歴の討議例のみ。新ケースはnamed sourceのafterである。
CI生成依存0、product/CI変更/実装GO0。
# Current visual target

The current v7 candidate is [one-world Atlas](unified.md), with one graph/selection/frame comparison.
The two-pane integration below is preserved history, not a mandatory/optimality claim.

See [integrated HTML candidate](integration.md) and [source template](integration.example.html).
The former v5 placement agreement is preserved history; the current Human request is
the 18185 baseline plus the v4 Purpose intent in one Atlas. Same-source agreement is pending.
