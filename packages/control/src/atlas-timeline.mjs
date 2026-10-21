// The World timeline (contract 3, re-revised: S7, adrs#647 comment
// 6308860425): past frames stepped one at a time, one present anchor (the
// latest supplied frame) and, past it, the steps of the present's upkeep:
// each stale_at minute at which, with no new observation, its conditions read
// unknown. A step is never a frame: the three areas stay the present's, and
// only the box of changes says the step. Nothing here is drawn on the graph.
// Pure; no DOM.

import { dayClockText } from './atlas-gap.mjs';

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
// The frame shown, as the status row names it; on a step, which step of how
// many and its minute.
export const viewedText = (frames, frame, step = null, count = 0) => {
  const { index, count: frameCount, present } = timelinePosition(frames, frame.id);
  if (step !== null) return '表示中：予定 ' + (step.index + 1) + '/' + count + ' · ' + step.at + '（観測が無ければ）';
  return index < 0 ? '表示中：保持中の frame ' + frame.id + '（最新入力に無い）'
    : '表示中：' + (present ? '現在' : '過去') + ' ' + (index + 1) + '/' + frameCount + ' · ' + frame.id;
};

// The steps past the present (S7): the present frame's upkeep grouped by its
// stale_at minute, earliest first, each with its conditions. A condition is
// fresh up to its stale_at itself (≦), so only one whose stale_at is past
// `now` is left out (the present then reads stale already). Nothing is
// judged: no difference, phase or count is made.
export const forecastSteps = (frame, now) => {
  const steps = new Map();
  for (const item of [...(frame.upkeep ?? [])].sort((a, b) => Date.parse(a.stale_at) - Date.parse(b.stale_at) || a.condition.localeCompare(b.condition))) {
    if (Number.isFinite(now) && now > Date.parse(item.stale_at)) continue;
    const at = dayClockText(item.stale_at);
    steps.set(at, [...(steps.get(at) ?? []), item]);
  }
  return Object.freeze([...steps].map(([at, items], index) => Object.freeze({ index, at, items: Object.freeze(items) })));
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
