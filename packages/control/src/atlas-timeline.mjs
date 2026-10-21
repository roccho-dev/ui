// The World timeline: past frames stepped one at a time and one present
// anchor (the latest supplied frame), the words of the status row, the planned
// side of the latest frame (予定 ▸) and the entries of a frame (仕訳 ▸). A plan
// is never a frame and never a fact; with no supplied plan it is shown as
// undeclared (UNKNOWN), not as an empty future. Nothing here is drawn on the
// graph (contract 3, revised: no strip or band). Pure; no DOM.

import { JOURNAL_LABEL, JOURNAL_MARK, UNBOUND_MARK, admissionMark, dayClockText } from './atlas-gap.mjs';

export const PLAN_UNDECLARED = '予定：計画未宣言（UNKNOWN）';
export const PLAN_NONE = '予定：有効な計画 0 件';
// The live connection as the status row states it, from what arrived on the
// current connection (an open connection alone is never receiving):
// 'sample'       no `?events=`
// 'disconnected' no connection
// 'silent'       nothing accepted within RECEIVE_WINDOW_MS
// 'nodata'       heartbeats arrive, but no snapshot was accepted
// 'mismatch'     the last heartbeat's size differs from the accepted snapshot
// 'live'         the accepted snapshot is what the producer holds, recently
// Only 'live' may say the World shown follows the latest.
export const TRANSPORT_DISCONNECTED = 'SSE 未接続';
export const TRANSPORT_SILENT = 'SSE 応答なし';
export const TRANSPORT_NO_DATA = 'SSE 接続中・データ未受信';
export const TRANSPORT_MISMATCH = '最新か不明（大きさ不一致）';
// Three times the HQ producer's 30 s heartbeat.
export const RECEIVE_WINDOW_MS = 90_000;
export const UPDATE_STALLED = '更新停止・最新か不明';
// A live page whose newest frame's asOf is more than three update periods
// old: the World stopped advancing. Heartbeats do not clear it (they show
// the stream is open, not that the World moved). The period is the World's
// actual update period, named only by the build (--update-interval-minutes);
// without it no stall is claimed. Limit: an update that passes no current
// leaves asOf at the last ledger time, so a World whose content does not
// change can read stalled while its updates still run.
export const updateStalled = ({ mode, now = null, asOf, updateIntervalMs = null }) => mode === 'live'
  && updateIntervalMs !== null && Number.isFinite(now) && now - Date.parse(asOf) > 3 * updateIntervalMs;
export const transportOf = ({ mode, connected, receivedAt = null, now = null, snapshotBytes = null, heartbeatBytes = null }) => {
  if (mode !== 'live') return 'sample';
  if (!connected) return 'disconnected';
  if (receivedAt === null || now === null || now - receivedAt > RECEIVE_WINDOW_MS) return 'silent';
  if (snapshotBytes === null) return 'nodata';
  if (heartbeatBytes !== null && heartbeatBytes !== snapshotBytes) return 'mismatch';
  return 'live';
};
const clockText = at => new Date(at).toISOString().slice(11, 19) + 'Z';
const TRANSPORT_WARNING = Object.freeze({ disconnected: TRANSPORT_DISCONNECTED, silent: TRANSPORT_SILENT, nodata: TRANSPORT_NO_DATA, mismatch: TRANSPORT_MISMATCH });
// The status line's account of the live stream: any reason not to trust that
// the World shown is the latest (a warning, or null), and when it last
// received (null on a sample).
export const transportParts = state => {
  const transport = transportOf(state);
  if (transport === 'sample') return Object.freeze({ warning: null, last: null });
  return Object.freeze({ warning: TRANSPORT_WARNING[transport] ?? null,
    last: state.receivedAt === null ? '最終受信なし' : '最終受信 ' + clockText(state.receivedAt) });
};
// The frame shown, as the status row names it.
export const viewedText = (frames, frame) => {
  const { index, count, present } = timelinePosition(frames, frame.id);
  return index < 0 ? '表示中：保持中の frame ' + frame.id + '（最新入力に無い）'
    : '表示中：' + (present ? '現在' : '過去') + ' ' + (index + 1) + '/' + count + ' · ' + frame.id;
};
const CONTENT_UNKNOWN = '内容 UNKNOWN';

// The plan cell's line for the displayed frame's plans (frame.plans):
// absent/null is undeclared, [] is declared with none in force, otherwise the
// count and how many have unknown content. Each plan's source and version are
// in the detail. A plan is never a fact and never changes any status.
export const planSummary = plans => {
  if (plans === null || plans === undefined) return PLAN_UNDECLARED;
  if (plans.length === 0) return PLAN_NONE;
  const unknown = plans.filter(plan => plan.nodes === null).length;
  return '予定 ' + plans.length + ' 件' + (unknown ? '・' + CONTENT_UNKNOWN + ' ' + unknown : '');
};
// The opened plan detail: per plan, its label, what it serves, its content
// or why that is unknown, and where it was read from. Supplied text only.
export const planDetailLines = plans => {
  if (plans === null || plans === undefined) return [PLAN_UNDECLARED];
  if (plans.length === 0) return [PLAN_NONE];
  return plans.flatMap((plan, index) => [
    '計画 ' + (index + 1) + '/' + plans.length + '：' + plan.ref + ' v' + plan.version + ' · ' + plan.label,
    '計画 id：' + plan.plan,
    '寄与する requires：' + (plan.serves.length ? plan.serves.join('、') : 'なし（宣言なし）'),
    plan.nodes === null
      ? CONTENT_UNKNOWN + (plan.unknown.length ? '：' + plan.unknown.join('、') : '')
      : '内容：ノード ' + plan.nodes.length + ' 件 · 辺 ' + (plan.edges === null ? 'UNKNOWN' : plan.edges.length + ' 件')
        + (plan.unknown.length ? ' · 不明：' + plan.unknown.join('、') : ''),
    '出所：' + plan.source.repo + ' · comment ' + (plan.source.commentId ?? 'UNKNOWN') + ' · 更新 ' + (plan.source.updatedAt ?? 'UNKNOWN')
      + ' · sha256 ' + (plan.source.sha256 ?? 'UNKNOWN'),
  ]);
};

// One journal entry as a row: its mark and kind, the plan it names, when it
// was recorded, its author and its source.
export const journalRow = entry => JOURNAL_MARK[entry.kind] + ' ' + JOURNAL_LABEL[entry.kind] + (entry.unbound === true ? UNBOUND_MARK : '')
  + (entry.kind === 'plan.set' && entry.plan ? ' ' + entry.plan + (entry.version === undefined ? '' : ' v' + entry.version) : '')
  + ' · ' + entry.recordedAt + ' · 作者 ' + (entry.actor ?? '不明')
  + ' · 出所 ' + entry.source.ref + admissionMark(entry) + (entry.source.commentId === undefined || entry.source.commentId === null ? '' : ' comment ' + entry.source.commentId)
  + ' · sha256 ' + (entry.source.sha256 ?? 'UNKNOWN');
// 仕訳 n ▸ (contract 3, revised): the entries the displayed frame carries
// (v6: only those new at it), one row each.
export const journalLines = frame => (frame.journal ?? []).map(journalRow);
// S6 (cases 15 and 29): the declarations held back (v12 frames[i].held) up to
// the displayed frame, one row each in the order they entered, listed in
// 仕訳 ▸ after the entries. A held frame no longer in the input has its own only.
export const heldLines = (frames, frame) => {
  const index = frames.findIndex(item => item.id === frame.id);
  return (index < 0 ? [frame] : frames.slice(0, index + 1)).flatMap(item => item.held ?? [])
    .map(item => '保持 ' + item.reason + ' · ' + (item.kind ?? '種類不明') + ' · ' + item.recordedAt + ' · 出所 ' + item.source.ref);
};
// The button counts both, so they are seen without opening the list, and
// says they differ: 仕訳 is the frame's own, 保持 accumulated up to it.
export const journalButtonText = (entries, held, open) => '仕訳 ' + entries + ' · 保持 ' + held + '（累計）' + (open ? '▾' : '▸');
// 予定 ▸ (contract 3, revised): the planned side of the latest frame, never a
// frame and never a fact: its plans, the plans bound to no ideal state (each
// id at its newest version), and the upkeep — per condition, earliest first —
// or, without it, matched_until alone. A latest frame not matched has none.
export const forecastLines = frames => {
  const latest = frames.at(-1);
  const plans = latest.plans ?? null;
  const bound = new Set((plans ?? []).map(item => item.plan));
  const unbound = [...new Map(frames.flatMap(item => item.journal ?? []).filter(entry => entry.unbound === true && !bound.has(entry.plan))
    .map(entry => [entry.plan, entry])).values()];
  const upkeep = [...(latest.upkeep ?? [])].sort((a, b) => Date.parse(a.stale_at) - Date.parse(b.stale_at) || a.condition.localeCompare(b.condition));
  return Object.freeze(['予定（最新 ' + latest.id + ' · 計画であって事実ではない）', ...planDetailLines(plans),
    ...(unbound.length ? ['未結合 ' + unbound.length + ' 件：' + unbound.map(entry => entry.plan + (entry.version === undefined ? '' : ' v' + entry.version)).join(' · ')] : []),
    ...(latest.phase !== 'matched' ? ['維持の作業：なし（一致・維持ではない）']
      : upkeep.length ? ['維持の作業（鮮度切れの予定の早い順）',
        ...upkeep.map(item => item.condition + ' · 観測 ' + dayClockText(item.observedAt) + ' · 鮮度切れの予定 ' + dayClockText(item.stale_at))]
        : ['次の鮮度切れ ' + (latest.matched_until ? dayClockText(latest.matched_until) : '不明')])]);
};

// Where the displayed frame stands among the received frames. A held frame no
// longer in the received input has index -1 and is not the present.
export const timelinePosition = (frames, frameId) => {
  const count = frames.length;
  const index = frames.findIndex(frame => frame.id === frameId);
  return Object.freeze({ index, count, present: count > 0 && index === count - 1 });
};

// The frame index one step away. Steps stop at the present: there is no
// frame after the latest one, so a forward step there changes nothing.
export const stepIndex = ({ index, count }, delta) => {
  if (count === 0) return -1;
  const from = index < 0 ? count - 1 : index;
  return Math.max(0, Math.min(count - 1, from + Math.sign(delta)));
};

// The viewed state in the URL fragment: the selected record, and the frame
// only while a past frame is held. No `t` means the present.
export const parseViewHash = hash => {
  const params = new URLSearchParams(String(hash ?? '').replace(/^#/u, ''));
  return Object.freeze({ selected: params.get('sel') ?? '', frameId: params.get('t') ?? '' });
};

export const formatViewHash = ({ selected = '', frameId = '' } = {}) => {
  const parts = [];
  if (selected) parts.push('sel=' + encodeURIComponent(selected));
  if (frameId) parts.push('t=' + encodeURIComponent(frameId));
  return parts.length ? '#' + parts.join('&') : '';
};
