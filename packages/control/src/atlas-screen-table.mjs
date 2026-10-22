// The display section's table (adrs#647 comment 6306887827, S6): every kind
// of box and line the World screen draws and every control, what it carries,
// and whether it is unique (U: the model's information shown nowhere else on
// the screen) or projected (P: derived from a U, or shown elsewhere too). A P
// stays only when (a) reaching it from its U takes a User operation (move,
// open, search), or (b) the User decided it. tests/check-atlas-world-screen.mjs
// checks that the kinds drawn are this set; adding or removing an element is
// one row here, with its reason. Pure data.
//
// `box` names the box a line belongs to; within a box the rows are tried in
// order and a line is of the first kind whose `line` matches it whole.
const row = (box, id, carries, kind, line, reason = null) => Object.freeze({ box, id, carries, kind, line, reason });
const ANY = /^.+$/u;

export const SCREEN_LINES = Object.freeze([
  row('purpose', 'purpose-heading', '見出し', 'U', /^目的$/u),
  row('purpose', 'purpose-rev', 'rev・採択の印・評価の結論（L0、A3、13）', 'U', /^rev \S+(（[^）]+）)?( · (過去の)?評価：.+)?$/u),
  row('purpose', 'purpose-text', '目的の文', 'U', ANY),
  row('purpose-adequacy', 'adequacy-heading', '見出し', 'U', /^目的↔理想の差$/u),
  row('purpose-adequacy', 'adequacy-state', 'GapA の state・reason（1・2・5・19・20・24）', 'U', /^(不十分|不明) · .+$/u),
  row('purpose-adequacy', 'adequacy-awaiting', '人の判断待ち：User の評価で解ける理由だけ（no-evaluation・past、D1、apps#73）', 'U', /^人の判断待ち：User の評価（入力源）$/u),
  row('purpose-adequacy', 'adequacy-held', '入力源が保持した評価の理由：User の次の作用（D1、R c6343482688）', 'U', /^評価は保持：.+$/u),
  // P's records in the boxes (adrs#647 v2 c6346263403, R c6348033913): P's, never the User's evaluation.
  row('purpose-adequacy', 'adequacy-p-waiting', 'P が記録した User の判断待ち：問い・系列・いつから（判断の記録が名指すまで）', 'U',
    /^User の判断待ち：.+（.+・\d\d-\d\d \d\d:\d\dZ? から・P の記録）$/u),
  row('purpose-adequacy', 'adequacy-evaluator', '評価者の評価（未検証、23・24）', 'U', /^評価者の評価（未検証） .+$/u),
  row('ideal-state', 'ideal-heading', '見出し', 'U', /^理想状態$/u),
  row('ideal-state', 'ideal-version', '版・採択の印・移動・条件の数・改訂中（L1、11、14）', 'U',
    /^(v\S+→)?v[^\s（]+(（[^）]+）)?( 移動)? · 条件 (\d+|未供給)( · 改訂中 v\S+)?$/u),
  row('ideal-state', 'ideal-none', '照らし合わせる理想状態が無いこととその訳（定義中・目的は終了・未定義）', 'U', /^照らし合わせる理想状態なし（(定義中|目的は終了|未定義)）$/u),
  row('ideal-state', 'ideal-plan', 'その frame の計画の中身：label・寄与する条件・内容・出所（S7、ほかでは読めない）', 'U',
    /^計画 .+ · 寄与 .+ · 内容 (UNKNOWN|ノード \d+ 件) · 出所 .+$/u),
  row('ideal-state', 'ideal-plans', '計画の件数・未結合 n 件', 'P', /^計画：.+$/u, '(b) #373「画面には常に出す」。仕訳の plan.set からも数えられる'),
  row('gap', 'gap-heading', '局面と起点・採択の印・次の鮮度切れ、鮮度切れ・最新か不明（22）、gap との不整合', 'U',
    /^理想↔現在の差(（(目的変更|定義中|近似中|一致・維持|目的の終了)(（[^）]+）)?・\d\d-\d\d \d\d:\d\dZ から(・次の鮮度切れ (\d\d-\d\d \d\d:\d\dZ|不明)|・鮮度切れ・最新か不明（\S+ \S+ を過ぎた）)?）)?( · gap と不整合)?$/u,
    '次の鮮度切れだけは P (a)：次へ ▶ で予定の歩みに進むと読める'),
  row('gap', 'gap-previous', '前の時点の差の数・集計不一致', 'P', /^(初回|前 (\d+|不明))( · 集計不一致)?$/u, '(a) 前の時点へ戻らないと読めない'),
  row('gap', 'gap-unknown', '差が不明・対象外であること', 'U', /^差 (不明|対象外)$/u),
  row('gap', 'gap-reason', '差が無い訳', 'U', /^(照らし合わせる理想状態がまだ無い|目的は終了した)$/u),
  row('gap', 'gap-unplaced', 'Scope に付かない差 n 件（v8：黙って落とさない）', 'U', /^Scope に付かない差 \d+ 件$/u),
  row('gap', 'gap-part', '条件ごとの差・原因・物理Scope（未特定を含む、4・8〜11）', 'U', /^[!?] \S+( · .+)?$/u),
  row('current-state', 'current-heading', '見出し', 'U', /^現在状態$/u),
  row('current-state', 'current-observed', '観測の件数・最新の時刻（L2）', 'U', /^(観測 \d+ 件 · 最新 \S+|観測の仕訳なし)$/u),
  row('current-state', 'current-before-ideal', '理想の確定前の観測で一致 n 件（16）', 'U', /^理想状態の確定前の観測で一致 \d+ 件$/u),
  row('current-state', 'current-claims', '作業の主張の件数（17）', 'U', /^作業の主張（current） \d+ 件$/u),
  row('current-state', 'current-stopped', '止まった経路の最後の主張の件数と、止まった時刻（v4、adrs#647 c6339644103）', 'U',
    /^止まった経路の最後の主張（current） \d+ 件 · \d\d-\d\d \d\d:\d\dZ? 以後は更新されない$/u),
  row('current-state', 'current-p-heartbeat', 'P が記録した最新の心拍：run・tunnel・HQ ループ・reap・張り直し・時刻（P の記録）', 'U',
    /^心拍（P の記録）：run \S+ · tunnel \S+ · HQ ループ \S+ · reap \d+ · 張り直し \d+ · \d\d-\d\d \d\d:\d\dZ?$/u),
  row('current-state', 'current-p-loop', 'P が記録した、その frame の日の loop の停止の件数と不要の件数（P の記録）', 'U',
    /^loop の停止（P の記録）：\d\d-\d\d \d+ 件（不要 \d+）$/u),
  row('current-state', 'current-claim', '作業の主張（17）', 'U', ANY),
  row('gap-part', 'part-since', 'since・担当（担当未確定）・最後の観測（10・12・26）', 'U', /^(この時点から|\d+ 時点前から)（[^）]+）( · .+)?$/u),
  row('gap-part', 'part-text', '条件の文', 'U', ANY),
  row('gap-closed', 'closed-count', '閉じた差の数（10・11・13）', 'U', /^閉じた差 \d+（この時点 \d+）$/u),
  row('gap-closed', 'closed-list', '閉じた差の条件と閉じ方', 'U', ANY),
  // D6 (apps#73; R c6342315491): the one place on the screen that says some of an area is not drawn, by reason.
  row('area', 'area-omitted', '描かれない対象の件数（上限・非表示）と、検索で読めること（D6、apps#73）', 'U', /^(上限で描かない|非表示) \d+ 件（検索で読める）$/u),
  row('area', 'area-name', 'エリアの名（presentation が供給する）', 'U', ANY),
  row('history-hidden', 'history-hidden-count', '現在の図に描かない履歴の単位の件数（B1・D6、apps#73）', 'P', /^履歴 \d+ 件（◀ 前へと検索で読める）$/u,
    '(a) 中身は ◀ 前へか検索で読める（adrs#647 c6341039299）'),
  row('scope-card', 'card-since', 'since・担当（担当未確定）・最後の観測（10・12・26）', 'U', /^(この時点から|\d+ 時点前から)（[^）]+）( · .+)?$/u),
  row('scope-card', 'card-text', '供給された Scope の文', 'U', ANY),
  // P's report at a glance (User c6351593265, R c6352966769): the latest of each kind of P's record up to the frame,
  // on the first screen. P (a): each line is also a row of the changes of the frame it entered, reached only by ◀ 前へ.
  row('p-summary', 'summary-heading', '見出し：P の記録であること・未照合', 'P', /^P の報告の要約（P の記録・未照合）$/u, '(a) 元は変化の欄、◀ 前へでしか届かない'),
  row('p-summary', 'summary-series', '系列の数と閉じた系列（Q1）', 'P', /^(系列 \d+ · 閉じた \d+(（.+）)?|系列の一覧 無し)$/u, '(a) 系列カードは scroll が要る'),
  row('p-summary', 'summary-waiting', 'User の判断待ちの件数と系列ごとの数（Q2）', 'P', /^(User の判断待ち \d+ 件：.+|User の判断待ち 無し)$/u, '(a) 目的↔理想の差の行は画面の外に出うる'),
  row('p-summary', 'summary-loop', 'その日の loop の停止と不要の数（Q4）', 'P', /^loop の停止 (\d\d-\d\d (\d+ 件（不要 \d+）|無し)|不明)$/u, '(a) 現在状態の行は scroll が要る'),
  row('p-summary', 'summary-heartbeat', '最新の心拍（Q5）', 'P', /^(心拍：run \S+ · tunnel \S+ · HQ ループ \S+（\d\d-\d\d \d\d:\d\dZ?）|心拍 無し)$/u, '(a) 同上'),
  row('p-summary', 'summary-latest', '種類ごとの直近（判断・撤回と訂正・receipt・レビュー・User の基準、Q7–Q10）', 'P',
    /^(直近の ?(判断|撤回・訂正|receipt|レビュー|User の基準)：.+（\d\d-\d\d \d\d:\d\dZ?）|直近の ?(判断|撤回・訂正|receipt|レビュー|User の基準) 無し)$/u, '(a) 変化の欄、◀ 前へ'),
  row('p-summary', 'summary-replaced', '置き換えの件数と、何が何に（Q11）', 'P', /^(置き換え \d+ 件：.+|置き換え 無し)$/u, '(a) 変化の欄、◀ 前へ'),
  row('p-summary', 'summary-cost', '費用の在りか：系列ごとの正本（数は UNKNOWN、Q12）', 'P', /^(費用（数は正本、Atlas では UNKNOWN）：.+|費用の在りか 不明（系列の一覧 無し）)$/u, '(a) 系列カードは scroll が要る'),
  // P's series list (p.series; adrs#647 W c6349826755, R c6349841686): one card per series, P's record; no session id.
  row('p-series', 'series-state', '系列の状態（進行中・閉じた・待ち）', 'U', /^状態 (進行中|閉じた|待ち)$/u),
  row('p-series', 'series-waiting', 'その系列の User の判断待ちの件数（P の記録）', 'U', /^User の判断待ち \d+ 件（P の記録）$/u),
  row('p-series', 'series-cost', '費用の在りか：系列の正本（数は正本、Atlas では UNKNOWN）', 'U', /^費用：\S+（数は正本、Atlas では UNKNOWN）$/u),
  row('p-series', 'series-source', '系列の一覧が P の記録であることと、その時刻', 'U', /^系列の一覧（P の記録） · \d\d-\d\d \d\d:\d\dZ?$/u),
  row('p-series', 'series-name', '系列の名と正本', 'U', /^\S+（[^）]+）$/u),
  row('physical', 'physical-keeps', '保つ条件（operation、25・30）', 'U', /^保つ: .+$/u),
  row('physical', 'physical-target', 'この差を埋める対象であること（development、27）', 'U', /^対象: 理想↔現在の差$/u),
  row('physical', 'physical-part', '担う条件・担当（担当未確定）・最後の観測', 'U', /^[!?] \S+ · .+$/u),
  row('physical', 'physical-name', 'repo・package（または id）', 'U', ANY),
  row('atlas-world-change', 'change-heading', 'この時点の変化の件数、保持 累計 m', 'U', /^この時点の変化 \d+ 件( · 保持 累計 \d+)?$/u,
    '保持 累計 m だけは P (a)：前の frame へ移らないと数えられない'),
  row('atlas-world-change', 'change-entry', 'その frame に入った仕訳：種類・時刻・作者・出所・sha256（S7、模型 4 行目）', 'U',
    /^\S+ .+ · \d{4}-\d\d-\d\dT\S+ · 作者 .+ · 出所 .+ · sha256 \S+$/u),
  row('atlas-world-change', 'change-p-record', 'その frame に入った P の記録：印・中身・系列・P が書いた時刻・P の記録（未照合）・出所（adrs#647 c6346827237）', 'U',
    /^[✋◆✎❞◈⏸▣♡☰↷] .+ · \d{4}-\d\d-\d\dT\S+ · P の記録（未照合） · 出所 .+$/u),
  // adrs#647 R c6349841686: a record P replaced, in any frame, shows only that it was replaced and by what.
  row('atlas-world-change', 'change-p-superseded', 'P が置き換えた記録：id・置き換えた id・時刻・出所（本文は描かない）', 'U',
    /^⊘ 置き換えられた P の記録 \S+ → \S+ · \d{4}-\d\d-\d\dT\S+ · P の記録（未照合） · 出所 .+$/u),
  row('atlas-world-change', 'change-held', 'その frame で保持した宣言：reason・種類・時刻・出所（15・28・29）', 'U', /^保持 \S+(?: \S+)? · \S+ · \S+ · 出所 .+$/u),
  // (a reason may name its reader: `p-record: at`, apps collect/precord.mjs)
  row('atlas-world-change', 'step-heading', '予定の歩みの時刻（現在の upkeep の stale_at、分刻み）', 'U', /^予定 \d\d-\d\d \d\d:\d\dZ（観測が無ければ unknown）$/u),
  row('atlas-world-change', 'step-row', 'その時刻に観測が無ければ unknown になる条件と、その観測の時刻（21）', 'U', /^鮮度切れの予定 \S+ · 観測 .+$/u),
  row('supplied', 'supplied-label', '供給された箱の文（Agent の activity、入れ子の owner の名を含む）', 'U', ANY),
]);

// Drawn without text: the relations keep their line (MMD P–A–I–B–C and S),
// never a label.
export const SCREEN_RELATIONS = Object.freeze([
  row('relation', 'relation-line', '関係の線（ラベルは無い）', 'P', null, '(b) ui#370 で合意した MMD の矢印'),
]);

// The status and search rows, by element id.
export const SCREEN_CONTROLS = Object.freeze([
  row('controls', 'atlas-world-status', '警告・LATEST/HELD・表示中（現在・過去・予定 k/K と時刻）・最終受信', 'U', null),
  row('controls', 'atlas-world-search', '描かれない記録に届く唯一の道', 'U', null),
  row('controls', 'atlas-world-search-results', '検索の結果', 'U', null),
  row('controls', 'atlas-world-search-count', '検索の件数（frame id・rev は状態の行にある）', 'U', null),
  // D4 (apps#73; adrs#647 W c6344580290, R c6345797392).
  row('controls', 'atlas-world-selection', '選択がこの時点に無いこと（最後に在った frame）・描かれない履歴であること、と最後に在った frame を HELD で開く道', 'U', null,
    '道だけは P (a)：無いと ◀ 前へを O(n) 回'),
  row('controls', 'atlas-world-step-back', 't-1', 'U', null),
  row('controls', 'atlas-world-step-forward', '次の frame と、現在の先の予定の歩み（stale_at に届く唯一の道、S7）', 'U', null),
  row('controls', 'atlas-world-present', '現在の frame', 'P', null, '(a) 無いと O(n) 回の操作'),
  row('controls', 'atlas-world-change', '表示中の時点の変化（S7c：時間の操作の直下、6 行（固定）、溢れた分は欄の中でスクロール）：行は box atlas-world-change の種類', 'U', null),
]);
