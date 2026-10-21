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
  row('purpose-adequacy', 'adequacy-evaluator', '評価者の評価（未検証、23・24）', 'U', /^評価者の評価（未検証） .+$/u),
  row('ideal-state', 'ideal-heading', '見出し', 'U', /^理想状態$/u),
  row('ideal-state', 'ideal-version', '版・採択の印・移動・条件の数・改訂中（L1、11、14）', 'U',
    /^(v\S+→)?v[^\s（]+(（[^）]+）)?( 移動)? · 条件 (\d+|未供給)( · 改訂中 v\S+)?$/u),
  row('ideal-state', 'ideal-none', '照らし合わせる理想状態が無いこととその訳（定義中・目的は終了・未定義）', 'U', /^照らし合わせる理想状態なし（(定義中|目的は終了|未定義)）$/u),
  row('ideal-state', 'ideal-plans', '計画の件数・未結合 n 件', 'P', /^計画：.+$/u, '(b) #373「画面には常に出す」。予定 ▸ にもある'),
  row('gap', 'gap-heading', '局面と起点・採択の印・次の鮮度切れ、鮮度切れ・最新か不明（22）、gap との不整合', 'U',
    /^理想↔現在の差(（(目的変更|定義中|近似中|一致・維持|目的の終了)(（[^）]+）)?・\d\d-\d\d \d\d:\d\dZ から(・次の鮮度切れ (\d\d-\d\d \d\d:\d\dZ|不明)|・鮮度切れ・最新か不明（\S+ \S+ を過ぎた）)?）)?( · gap と不整合)?$/u,
    '次の鮮度切れだけは P (a)：予定 ▸ を開くと読める'),
  row('gap', 'gap-previous', '前の時点の差の数・集計不一致', 'P', /^(初回|前 (\d+|不明))( · 集計不一致)?$/u, '(a) 前の時点へ戻らないと読めない'),
  row('gap', 'gap-unknown', '差が不明・対象外であること', 'U', /^差 (不明|対象外)$/u),
  row('gap', 'gap-reason', '差が無い訳', 'U', /^(照らし合わせる理想状態がまだ無い|目的は終了した)$/u),
  row('gap', 'gap-unplaced', 'Scope に付かない差 n 件（v8：黙って落とさない）', 'U', /^Scope に付かない差 \d+ 件$/u),
  row('gap', 'gap-part', '条件ごとの差・原因・物理Scope（未特定を含む、4・8〜11）', 'U', /^[!?] \S+( · .+)?$/u),
  row('current-state', 'current-heading', '見出し', 'U', /^現在状態$/u),
  row('current-state', 'current-observed', '観測の件数・最新の時刻（L2）', 'U', /^(観測 \d+ 件 · 最新 \S+|観測の仕訳なし)$/u),
  row('current-state', 'current-before-ideal', '理想の確定前の観測で一致 n 件（16）', 'U', /^理想状態の確定前の観測で一致 \d+ 件$/u),
  row('current-state', 'current-claims', '作業の主張の件数（17）', 'U', /^作業の主張（current） \d+ 件$/u),
  row('current-state', 'current-claim', '作業の主張（17）', 'U', ANY),
  row('gap-part', 'part-since', 'since・担当（担当未確定）・最後の観測（10・12・26）', 'U', /^(この時点から|\d+ 時点前から)（[^）]+）( · .+)?$/u),
  row('gap-part', 'part-text', '条件の文', 'U', ANY),
  row('gap-closed', 'closed-count', '閉じた差の数（10・11・13）', 'U', /^閉じた差 \d+（この時点 \d+）$/u),
  row('gap-closed', 'closed-list', '閉じた差の条件と閉じ方', 'U', ANY),
  row('scope-card', 'card-since', 'since・担当（担当未確定）・最後の観測（10・12・26）', 'U', /^(この時点から|\d+ 時点前から)（[^）]+）( · .+)?$/u),
  row('scope-card', 'card-text', '供給された Scope の文', 'U', ANY),
  row('physical', 'physical-keeps', '保つ条件（operation、25・30）', 'U', /^保つ: .+$/u),
  row('physical', 'physical-target', 'この差を埋める対象であること（development、27）', 'U', /^対象: 理想↔現在の差$/u),
  row('physical', 'physical-part', '担う条件・担当（担当未確定）・最後の観測', 'U', /^[!?] \S+ · .+$/u),
  row('physical', 'physical-name', 'repo・package（または id）', 'U', ANY),
  row('supplied', 'supplied-label', '供給された箱の文（Agent の activity、入れ子の owner の名を含む）', 'U', ANY),
]);

// Drawn without text: the relations keep their line (MMD P–A–I–B–C and S),
// never a label.
export const SCREEN_RELATIONS = Object.freeze([
  row('relation', 'relation-line', '関係の線（ラベルは無い）', 'P', null, '(b) ui#370 で合意した MMD の矢印'),
]);

// The status and search rows, by element id.
export const SCREEN_CONTROLS = Object.freeze([
  row('controls', 'atlas-world-status', '警告・LATEST/HELD・表示中・最終受信', 'U', null),
  row('controls', 'atlas-world-search', '描かれない記録に届く唯一の道', 'U', null),
  row('controls', 'atlas-world-search-results', '検索の結果', 'U', null),
  row('controls', 'atlas-world-search-count', '検索の件数（frame id・rev は状態の行にある）', 'U', null),
  row('controls', 'atlas-world-step-back', 't-1', 'U', null),
  row('controls', 'atlas-world-step-forward', 't+1 の frame（過去を表示中）', 'P', null, '(a) 無いと O(n) 回の操作'),
  row('controls', 'atlas-world-present', '現在の frame', 'P', null, '(a) 無いと O(n) 回の操作'),
  row('controls', 'atlas-world-forecast', '予定 ▸：t+1（計画の中身と条件ごとの鮮度切れ）', 'U', null),
  row('controls', 'atlas-world-journal', '仕訳 n · 保持 m（累計）▸：その frame の決定・観測の作者・時刻・出所と、その frame までに保持した宣言（累計）', 'U', null),
]);
