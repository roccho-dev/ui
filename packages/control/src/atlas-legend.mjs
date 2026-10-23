// The legend (User c6351431152: not always on the screen, opened from a "？" button; adrs#647 R c6355222463): what
// each symbol the World screen draws means, one per line, under the place it is drawn. Built from the very maps
// that draw the symbols, so a symbol added there with no meaning here fails tests/check-atlas-world-screen.mjs. Pure.
import { JOURNAL_LABEL, JOURNAL_MARK, P_RECORD_MARK, SUPERSEDED_MARK } from './atlas-gap.mjs';
import { ACTIVITY_TOKEN, ATLAS_STATUS } from './atlas-world-projection.mjs';

export const STATUS_MEANING = Object.freeze({
  conflict: '矛盾（評価や観測が食い違う）', unassigned: '担当なし', awaitingUser: '人の判断待ち（User の評価・判断）',
  unknown: '不明（観測なし・未解決）', unmet: '未達', satisfied: '充足（宣言どおり）', history: '履歴（閉じた・残すだけ）',
});
export const ACTIVITY_MEANING = Object.freeze({ now: '今動いている', recent: '最近動いた', unknown: '動いているか不明' });
export const P_RECORD_MEANING = Object.freeze({
  'user.decision.requested': 'User の判断待ち', 'user.decision.recorded': 'User の判断', 'p.position': 'P の主張・撤回・訂正',
  'review.pasted': '貼られたレビュー', 'user.criterion': 'User の基準', 'loop.stopped': 'loop の停止', 'p.receipt': 'P の receipt',
  heartbeat: '心拍', 'p.series': '系列の一覧', 'p.supersede': '置き換え', 'p.node': 'MMD のノード', 'p.capability': '能力',
});

// The lines that head a group (drawn bold).
export const LEGEND_HEADINGS = Object.freeze(new Set(['箱の記号（状態。色と共に）', '箱の記号（動き）', '変化の欄の記号（記録）', '変化の欄の記号（P の記録・未照合）']));
export const LEGEND_LINES = Object.freeze([
  '凡例（「？」でもう一度押すと閉じる）',
  '箱の記号（状態。色と共に）',
  ...Object.entries(ATLAS_STATUS).map(([status, { symbol }]) => symbol + ' ' + STATUS_MEANING[status]),
  '破線の枠：不明か担当なし',
  '■（箱の右上）：選択中の箱',
  '箱の記号（動き）',
  ...Object.entries(ACTIVITY_TOKEN).filter(([, symbol]) => symbol).map(([activity, symbol]) => symbol + ' ' + ACTIVITY_MEANING[activity]),
  '変化の欄の記号（記録）',
  ...Object.entries(JOURNAL_MARK).map(([kind, mark]) => mark + ' ' + JOURNAL_LABEL[kind]),
  '変化の欄の記号（P の記録・未照合）',
  ...Object.entries(P_RECORD_MARK).map(([kind, mark]) => mark + ' ' + P_RECORD_MEANING[kind]),
  SUPERSEDED_MARK + ' 置き換えられた記録（文は出さない）',
  '保持：受け付けず保持した入力',
]);
