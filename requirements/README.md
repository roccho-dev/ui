# ui#207 — P0開発引継ぎ契約

版 0.2 / 2026-09-08 JST / **Draft・レビュー対象**

このディレクトリを入口に、会話やChatGPT添付なしでP0からP8まで進める。P0は最初のREDだけの準備ではなく、**全要件・全段階・停止条件・最終DoDの契約**である。P0の作成、P0の受理、各機能のGREEN、#207の完成、merge許可は別の状態である。

## 読む順序と所有境界

1. 本書：全段階の手順・責務・DoR/DoD・変更管理。
2. [test-list.md](test-list.md)：19領域200シナリオ、20完了条件、10 fixture群、既存検査の対応候補、12反証例。初版の「今回」は0.1作成時の記録であり、現在のPR状態を表さない。シナリオ本文は削らない。
3. [coverage-map.json](coverage-map.json)：各シナリオを必ず一つの主担当フェーズへ割り当てる。後段の再検証は所有権の重複ではない。
4. [first-red.md](first-red.md)：最初のRC-01の公開呼出し・具体入力・独立期待値・実行手順。
5. [baseline.json](baseline.json)：基準Git object、元添付hash、関連Issue、確認できた環境、未完了監査の区別。

#207は目的・設計合意の入口。Git側のこの契約とTest Listが開発の詳細。Issueへ200行を複写しない。Issueの変更を採用するときだけ、原文snapshot・取得時刻・本文hash・意味差分と対象シナリオをGitへ取り込み、新しい契約commitをreviewする。Git側の文書から上位の合意を無断上書きしない。

```text
上流：AI → 意思決定候補 → 上流所有者の検証・受理 → 確定意思決定JSONL
設計：確定意思決定＋表示目的・制約 → AI／規則／人 → UI定義候補〈根拠参照付き〉→ UI検証・受理
表示：確定UI定義イベントJSONL → reduce〈UI状態〉→ compile〈A2UI入力＋Scene〉→ A2UI → DOM［図部品：maxGraph → DOM］
編集：操作 → 変更先の判定 → 対応する候補・検証・受理 → 対応する確定JSONL → UI整合確認 → 再構築
```

表示設計とcompileは別。compileにAI再判断を入れない。UI定義と上流決定は別責務の確定入力であり、第三のprojection正本を作らない。意味／部品tree／図の座標を混同しない。表示変更で上流を変えず、上流変更は受理後にUI整合・必要な再設計を経る。一時操作は両logへ追記しない。ローカルUI受理は外部サービス不要だが業務承認ではない。

目標は `core`（契約・UI reduce/compile・候補検証・受理手順・Port）、`a2ui-adapter`（公式描画器・部品・操作通知）、`maxgraph-adapter`（図の表示・操作）、`runtime`（起動・注入・URL・機能選択・照合・上限・資源・上流/保存先・出力）の4 packages。adapter間は相互importせずruntimeから注入する。内部ファイル名まで過剰に固定しない。移行中の旧packageの存在は最終形と区別し、検証前に削除しない。

## 1. 新規開発者の最初の操作

前提：Git、Node.js、Python3、GitHub CLI（原文取得・PR操作用）。P0構造検査自体にnpm installは不要。基準CIのNodeは24、browser toolingはPlaywright 1.57.0。実際のpatch版・browser build・OS・fontを実行証跡へ記録する。本repoの基準flakeにはdevShellがないため、`nix develop`や存在しないpackage-lockに対する`npm ci`を既定手順にしない。初回の大きなtooling導入・依存更新をP0へ混ぜない。

```sh
# 未cloneの作業端末。既存cloneがある場合はそのcloneを使う。
git clone --branch proposals https://github.com/roccho-dev/ui.git ui
cd ui
git fetch origin docs/207-p0-development-contract-260908
git worktree add -b review/207-p0 ../ui-207-p0 origin/docs/207-p0-development-contract-260908
cd ../ui-207-p0
node tests/check-ui-207-contract.mjs
node tools/ui-207-inventory.mjs > /tmp/ui-207-inventory.json
```

`check-ui-207-contract`の成功は文書・割当の構造検査だけ。200シナリオの成功でもP0受理でもない。inventoryは基準commitのGit objectから全pathと各blob IDを採取する読取専用処理。候補となる検査行の抽出は探索補助であり、全assertionの意味判定ではない。完全なファイル・呼出し元・ループ・helperも読んでQ03を閉じる。

基準コードの検査は契約PRと混ぜず、別worktreeで取得する。

```sh
git worktree add --detach ../ui-207-baseline 6622f9887d65ea0c297c4b7c35ee5ef21030a89d
cd ../ui-207-baseline
node --version
python3 --version
npm run check
# browser toolingは専用venv等へ導入する。
python3 -m venv /tmp/ui-207-proof-venv
. /tmp/ui-207-proof-venv/bin/activate
python3 -m pip install 'playwright==1.57.0'
python3 -m playwright install chromium
python3 packages/semantic-map/tests/browser_example.py
npm run proof:semantic-map-meaning-recovery
python3 packages/decision-packet/tests/browser-example.py
python3 apps/artifact-shell/tests/browser-proof.py
python3 apps/artifact-shell/tests/decision-packet-browser-proof.py
```

これは基準workflowからの主要入口であり全CIの代替ではない。Linuxのbrowser依存・日本語fontは同じ基準workflowに従う。Nix、gov、artifact build、gesture-review join、条件付きSSG等をinventoryから追跡する。各commandを個別に実行し、最初の失敗で残りを実行済みにしない。終了コード・stdout/stderr・対象commitを保存する。#206の原因修復は別PR。同じ失敗をP1のREDに転用しない。

## 2. 全フェーズ共通の進め方

各フェーズは巨大な一括REDではない。**一覧から1件だけ具体化 → RED → 既存とともにGREEN → 必要な整理**を反復する。既に満たす振る舞いはGREENの回帰として受け継ぎ、人為的に壊してREDを作らない。複数ケース行は子ID（例 `CH-02/01`）へ展開し、親IDと分母を残す。

開始条件（DoR）：採用契約commit、前段の対象head、対象ID・独立期待値、影響するQの解決、実行できる環境、対象に必要な基準回帰が確認されている。未解決の無関係な事項は対象範囲を明示して切り離せるが、全体完了から消さない。P0未受理で探索branchを作ることと、採用契約に基づくP1着手は区別する。

REDのDoD：公開入口が呼べ、対象のassertionが意図した未達で失敗する。import不能・syntax error・fixture欠損・通信故障は準備不足／環境失敗。expected failureの観測を製品PASSへ変えない。REDだけのmergeはそのheadへの明示承認が必要。#201の例外を継承しない。

GREENのDoD：期待値を弱めず対象と影響する既存回帰が成功する。副作用・異常系・対応範囲も指定どおりで、reviewと証跡が同じcutに対応する。後段に属する検証は未達として残す。実操作要件をhelper呼出し・mock・source文字列検査だけで代替しない。

## 3. P0からP8までの契約

対象IDの唯一の主担当割当はcoverage-map.json。次の「入口例」はそのフェーズ全体の代替ではない。全フェーズで境界・証跡・受理規則を継続適用し、P8の再検証対象は全必須IDである。

**次段階への引渡し可能（readyForNext）と、そのフェーズの全対象完了（phaseDone）を分ける。** dependsOnは必要な公開契約と最小のGREENが揃う引渡し関係であり、前段の後続検証まで先に終わらせる循環条件ではない。例えばRC-11/12のcore検査はP1で行い、実ブラウザ部分はP2以降で同じIDへ証跡を追加する。TR-05の最小参照検証はP1で先行でき、主担当P5で上流連携を含む全証拠を閉じる。BL-08の対応範囲はP0で宣言をreviewし、実表示/操作の成立は後続の証跡で閉じる。主担当の唯一性は複数レベルの検証を禁止しない。

引渡しPRは各IDについて「取得済みの証拠レベル／不足レベル／不足を閉じるフェーズ」を必ず記録する。不足を黙って省いてphaseDoneにはしない。P8は全段階のphaseDoneと全必須IDの全証拠を要求する。P0だけは全体契約の受理が次段階への条件であり、未照合を受理済みにする例外ではない。

| 段階 | 入る条件・最初の具体化 | 変更可能範囲と禁止 | 段階DoD・次へ渡すもの |
|---|---|---|---|
| P0 全体契約 | 固定基準＋元一覧。まずBL-01/02/03の原文・入口・意味対応を確認 | requirements・根拠snapshot・監査・構造検査。機能のGREEN実装・旧経路削除・CI緩和はしない | 200行と発見分の責務・期待値・20条件対応、全既存要件の意味照合、最初の公開契約、各Qのowner/期限、初見reviewを成立させる。**文書構造PASSだけでは閉じない** |
| P1 最小core | P0受理、Q01最小入力・Q02入力上限確定。first-red.mdのRC-01から1件 | coreの独自UIイベント・純粋reduce/compileと検証。DOM・AI・上流業務reducer・別SDUI言語は禁止 | F01の文字・ID・参照・順序・非変更、入力負例、固定条件のcompileが成立。公開入口・fixture・回帰commandをP2へ渡す |
| P2 通常UI | P1の最小GREEN、Q04 browser、Q05公式renderer/catalogの実体固定。UI-01 | a2ui-adapter＋最小runtime。旧自作DOM描画器の包装を公式化と呼ばない | 実ブラウザでText・binding・通常部品・安全性・操作通知。F01/F02と実画面の観測点、起動commandをP3へ渡す |
| P3 図の縦経路 | P2、図Sceneの公開契約・固定座標／配線。UI-06/GR-04 | maxgraph-adapterとruntime注入、A2UI図部品。adapter相互import・内蔵再配置は禁止 | F03の2node/1edgeが同じ画面内に現れ、実形状がSceneと一致。破棄／再mount・ID対応・図gesture入力をP4へ渡す |
| P4 ローカル往復 | P3、Q06ローカル保持方式・失敗条件、Q07受理境界。ED-01→AC-01→RP-01 | core編集/受理とruntimeローカルadapter。外部を必須化しない。上流変更をUI内へ直送しない | 通常UI/図の表示編集・固定解除・拒否/取消0追記・重複1確定・失敗/不明を区別。fresh replayで保存意図を独立期待値と照合。確定結果と保存範囲をP5へ渡す |
| P5 上流/外部 | P4、Q06接続先契約とQ07 review主体。TR-07、ED-04、UP-01を順に | core参照/整合・decisions/events Port・runtime接続。上流の業務判断/権限は外部 | 参照だけ正しい誤表示を拒否し、上流変更→別の受理→UI整合/必要な再設計→UI受理を実証。simulatorと実接続の証明範囲を分ける。F10・対象版・未確定の確認手順を引継ぐ |
| P6 表現意味 | P4/P5と該当領域のQ02/03/04/05解決。領域ごとに旧意味→具体ケース | coreの表現規則と必要adapter。旧形式互換は不要。既存不具合の追認や全図編集可能の宣言は禁止 | 集合・sequence・8chart/65構成・地図・製品別表現を新経路で全件検証。#205の初期拡張は別の受入範囲のまま接続。形式を捨て意味を残した対応表をP7/P8へ渡す |
| P7 周辺移管 | P5までの共通経路と該当Q解決。旧shellの機能ごとに移管 | runtime・資源・入れ子・出力/配布・既存consumer。URLだけ残して照合/上限/receiptを落とさない | 全shell責務、資源安全性、URL/fresh復元、配布物、人/agent同一engine、SSG開発/本番分離。実接続未証明を隠さない。退役可能pathと根拠をP8へ渡す |
| P8 退役/統合 | P1〜P7全対象が成立、Q全件完了、#206通常検査復旧 | 検証済み旧経路の削除・build/CI参照移管・最終証跡。期待値緩和・skipでの成功化は禁止 | 新経路だけで全必須要件・実browser往復・fresh再生・同一cutの必要CI/review成立。欠落0を登録要件の範囲で証明し、#207の20条件を閉じる。close/mergeは別途承認 |

P6はST/SQ/CH/GE/EXの子PRへ、P7はURL・資源・配布の子PRへ分けられる。独立に進める場合は親head・共有契約・競合範囲をPRで宣言し、前段未GREENの同じシナリオを積み重ねない。P6/P7の並行実行はP8の統合再検証を省く理由にならない。

## 4. 未決8項目を閉じる作業契約

ownerは役割であり架空の担当者名ではない。各PRのauthorを作成担当、別のreviewerを評価担当、repo所有者を仕様/merge受理主体として明記する。未割当は開始不能。機械検証できない意味判断は人または独立した領域reviewへ返す。状態は下表ではなく対象commitへのreview・実行証跡で管理する。

| ID | 作成担当／判断主体 | 決める内容・根拠・成果物 | 期限・停止対象 |
|---|---|---|---|
| Q01 | core担当／契約review＋repo所有者 | first-red.mdの最小提案をreviewし、UIイベント/根拠参照/候補/結果/空入力を確定。候補の自己申告を受理証明にしない。成果物は公開契約＋正負fixture | P1着手前。P0は提案作成可、契約未受理ならRC-01実装開始は保留 |
| Q02 | core/runtime担当／契約review | 固定基準のlimit定数と検査を全採取し、新契約へ数値/単位/適用範囲を対応。n−1,n,n＋1。性能は環境と予算を採用前に確定。GeoMap既存数値・chart65構成等を勝手に緩めない | 入力はP1前、図/資源は各該当PR前、全体はP8前。未測定を無制限にしない |
| Q03 | 移管担当／独立review＋repo所有者 | inventoryから全入口/全文/各assertion・生成ケースを読み、legacy-mapへsource blob＋line範囲＋意味＋シナリオ＋維持/明示変更/廃止合意を記録。関連Issue/consumerも照合。taccount/BS/PLは実装/要件/未確認を分ける | **P0の意味保存レビュー完了前**。未照合ならP0はDraft、探索可だが「全要件確認済み」でP1へ渡さない |
| Q04 | browser担当／利用要件review | 基準のNode24/Playwright1.57.0から開始し、browser実体/OS/font/viewport/touch/keyboard/file-open/判定方法を固定。Android実機とemulationを別証拠にする | P2の実表示前、実機主張は当該PR前、全対象はP8前 |
| Q05 | A2UI/資源担当／技術review | 公式仕様・catalog・rendererの実体をlock/digestへ固定し、実描画で互換を確認。固定snapshot再生とlive取得を別保証にする。取得不能・版違いは成功にしない | rendererはP2前、図内資源はP3前、live/地図はP6/P7前。未選定をlatestで補完しない |
| Q06 | runtime担当／接続先所有者＋review | ローカルは保持媒体/持続性を明示。外部はcandidateId＋expectedHead＋根拠版、commit/readback、重複・応答喪失・通知欠落・照会の契約を固定。credentialをrepoへ置かない | ローカルはP4前、外部契約はP5前。simulator作業可、実接続先未指定はAC-14と連携完成を止める |
| Q07 | 意味/表示設計担当／領域review主体 | 条件ごとに機械判定/外部review、対象版、受理主体、観測するUI/操作、独立期待値を決定。AI自己評価を唯一のoracleにしない | TR/EXの該当受理前。review不足はUNKNOWN、合格へ昇格しない |
| Q08 | #206修復担当／CI review | 基準各検査のcommand/exit/原因logを保存。#206を最小別PRで修復し、同じheadの通常CIと既存往復を再実行 | P0で既知失敗を分類、影響するGREEN/mergeとP8完成を止める。無関係な契約調査は可 |

Q01の提案・Q02〜Q08の作業契約を置いたことは解決済みを意味しない。P0受理に必要なQ03監査等は未完了のままにして成功を偽装しない。後段で決める事項にも期限があるため、新規開発者が会話から判断を推測する必要はない。

## 5. sourceと意味保存の監査手順

`tools/ui-207-inventory.mjs`を基準commitに対して実行する。全Git pathを分母として残し、テストらしいpathだけでなくworkflow・npm scripts・Nix・generator・fixture・docsから呼ばれる検証も追跡する。抽出が拾えないassertion/動的検証を「ない」としない。

P0で `requirements/legacy-map.json` を作成・reviewする。1項目は `{sourceCommit,path,blob,lineStart,lineEnd,meaning,scenarioIds,disposition,rationale,reviewRef}`。dispositionはmaintain/change/retire/pending。全検査fileに全文reviewの記録を持ち、各assertionの意味に対応するIDを割り当てる。loopの全組合せを一行へ対応させる場合は分母と展開規則を残す。未対応はpending、実装のバグは新しい期待値にしない。不要になった旧schema名/旧ファイルの存在確認は「形式退役」として根拠付き変更にし、振る舞いの検査とは分ける。

Issue原文は `gh api repos/roccho-dev/ui/issues/207`、コメントは `gh api --paginate --slurp repos/roccho-dev/ui/issues/207/comments` で取得し、取得JSONを `requirements/sources/` に保存してSHA-256を付ける。#171・#185・#190〜#193・#198・#205・#206も適用部分とコメントを固定する。#207の新しい境界を優先する意味差分は明記し、mutable URLだけを固定根拠の代用にしない。このP0初稿には全Issue原文snapshotと全assertion監査の完了はまだ含まれない。

外部consumerはAPI変更の意味対応も確認する。供給側mockだけで他repoの成功を主張しない。新たな要件が見つかったら既存IDを再利用せず追記する。200は初期分母であり上限ではない。

## 6. PR／worktreeとrebase

P0の採用commitを確認後、次の1シナリオのbranch/worktreeを前段の**確定SHA**から作る。下記の `PARENT_SHA`、`MERGED_SHA` はPRの実値で必ず指定する。空欄・latest・推測したmerge commitを使わない。

```sh
: "${PARENT_SHA:?採用した前段の40桁SHAを設定}"
git cat-file -e "${PARENT_SHA}^{commit}"
git worktree add -b test/207-p1-rc01-red ../ui-207-p1-rc01 "$PARENT_SHA"
# 作業後のPRはrepo標準template＋下の追加項目で作成する。
```

前段merge後は後続のold parentとown headを記録し、未commit変更がないことを確認する。squash/rebase mergeも考慮し、単純pullではなく後続固有commitだけを新基点へ移す。

```sh
: "${OLD_PARENT_SHA:?派生時の親headを設定}"
: "${MERGED_SHA:?前段の実際のmerge先SHAを設定}"
git fetch origin
git branch backup/207-before-rebase HEAD
git rebase --onto "$MERGED_SHA" "$OLD_PARENT_SHA"
# 競合解消時に期待値を再生成して合わせない。
node tests/check-ui-207-contract.mjs
# 対象検査・影響回帰・必要browser/CIを新headで再実行する。
```

backup branch名は作業ごとに一意にする。共有branchの書換えは共同作業者と調整する。pushが必要ならremoteの旧headを記録した `--force-with-lease` を使い、無条件forceしない。PRのbase・依存リンクを更新し、旧cutの証跡は履歴へ残しつつ現headのPASSへ流用しない。

各PRはrepo既定templateを残し、次を補う。

```text
Phase / scenario IDs / parent PR / parent SHA / contract SHA
Scope / non-scope / changed files / public I/O / prerequisite Q outcomes
Fixture paths+hashes / independent expected values / review authority
Exact commands / RED assertion+reason / GREEN regressions / exit codes
Browser vs mock vs real-service scope / artifacts+hashes / blockers
Rebase origin+destination / re-executed evidence / next scenario
Phase completion != feature completion != merge permission
```

親Issueは `Refs #207` で結ぶ。P0や個別RED PRに `Fixes #207` を書いて自動closeしない。自動merge・旧例外の流用・保護変更・skipによる成功化は禁止。PR as worktreeは作業分離であり、TDDの順序や承認条件を解除しない。

## 7. 証跡と最終DoD

`reports/<run>/` は実行時の生成物。要件本文へ手書きPASSを埋め込まない。reportにはphase、scenario/子ID、contract/test/implementationのSHA、input/fixture/source hashes、依存・browser/font・描画条件、command、exit、status、原始log、必要review、接続先と証明範囲を含める。dirty treeならdiff hashも残し、clean commitの結果と称しない。

同じcutとは実装SHAだけではなく、契約・tests・入力・根拠版・依存・環境の組。テスト追加後やrebase後は再実行する。古いrunは削除しないが最新の成功へ流用しない。review結果も対象SHAへ結び、レビュー後に対象が変われば再確認する。

```text
P0受理 = 全段階契約＋意味保存監査＋最初の公開呼出し/期待値＋停止条件がreviewで成立
RED完了 = 意図した対象不適合を実行可能テストで検出（製品機能は未達）
GREEN完了 = 対象＋影響回帰成功、必要reviewと同じcutの証拠
#207 DONE = 全維持/追加要件＋全必須具体ケース＋実公式描画/実操作往復/fresh再構築
             ＋全必要CI/review＋版付き証跡＋検証後の旧経路退役
```

未実行・UNKNOWN・不明・証拠欠損・必須skipをPASSへ変えない。承認済み非対象は元要件と廃止理由を残して分母から外すのであって、実行不能だから非対象にするのではない。#205の配置自由度拡張、#206のCI修復、#207の構成統一を同時に完了扱いしない。画像goldenだけでは意味を証明せず、独立数値/構造/操作と12反証例を組み合わせる。全ブラウザpixel一致や任意の上流業務判断の真理を主張しない。

## 8. このDraftの現在地

200シナリオをGitへ移し、全フェーズの主担当・依存・停止/引渡し、未決事項の判断手順、RC-01の具体化案、機械的な文書整合検査と基準inventory採取手段を用意した。新機能のRED/GREEN、全既存assertionの意味監査、全Issue原文の固定、全CI・実browser、外部サービスの実証、独立reviewは完了扱いしない。

**次の作業はP0の残監査・契約review。成立後にRC-01のRED PRへ進む。** P0を最初の1件の手順だけで閉じず、このファイルだけの構造PASSでも閉じない。新規開発者は本書のQ03/Q01と開始条件から、その時点で作るべきPRと止めるべき主張を判断する。
