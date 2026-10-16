// The World timeline: past frames stepped one at a time, one present anchor
// (the latest supplied frame) and a planned layer over the present. A plan is
// never a frame and never a fact; with no supplied plan it is shown as
// undeclared (UNKNOWN), not as an empty future. Pure; no DOM.

import { LABEL_LINE_PX, wrapLabel } from './atlas-text.mjs';

export const TIMELINE_ID_PREFIX = 'timeline:';
export const PLAN_UNDECLARED = '予定：計画未宣言（UNKNOWN）';
export const PLAN_NONE = '予定：有効な計画 0 件';
const CONTENT_UNKNOWN = '内容 UNKNOWN';

// The plan cell's one line for the displayed frame's plans (frame.plans):
// absent/null is undeclared, [] is declared with none in force, otherwise the
// count and each plan's source and version, naming plans whose content is
// unknown. A plan is never a fact and never changes any status.
export const planSummary = plans => {
  if (plans === null || plans === undefined) return PLAN_UNDECLARED;
  if (plans.length === 0) return PLAN_NONE;
  return '予定：計画 ' + plans.length + ' 件 · ' + plans.map(plan => plan.ref + ' v' + plan.version
    + (plan.nodes === null ? '（' + CONTENT_UNKNOWN + '）' : '')).join(' / ');
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

const appearance = Object.freeze({
  control: Object.freeze({ fillColor: '#ffffff', strokeColor: '#adb5bd', strokeWidth: 1, dashed: false }),
  idle: Object.freeze({ fillColor: '#f8f9fa', strokeColor: '#dee2e6', strokeWidth: 1, dashed: false }),
  plan: Object.freeze({ fillColor: '#ffffff', strokeColor: '#868e96', strokeWidth: 1, dashed: true }),
});

// One strip of screen-space regions, placed through the camera like the HUD.
// The plan cell reads the displayed frame's own plans; activating it opens or
// closes their detail, drawn as rows just above the strip in the plan look.
export const projectTimeline = ({
  frames,
  frame,
  latest = true,
  planOpen = false,
  strip,
  camera = { scale: 1, translateX: 0, translateY: 0 },
} = {}) => {
  const plans = frame.plans ?? null;
  const position = timelinePosition(frames, frame.id);
  const { index, count, present } = position;
  const screen = ({ x, y, width, height }) => ({
    x: x / camera.scale - camera.translateX, y: y / camera.scale - camera.translateY,
    width: width / camera.scale, height: height / camera.scale,
  });
  const cells = [];
  const cell = (id, label, share, { activation = null, look = 'control', atlas = {} } = {}) => cells.push({ id, label, share, activation, look, atlas });
  const back = stepIndex(position, -1), forward = stepIndex(position, 1);
  const where = index < 0
    ? '表示中：保持中の frame ' + frame.id + '（最新入力に無い）'
    : '表示中：' + (present ? '現在' : '過去') + ' ' + (index + 1) + '/' + count + ' · ' + frame.id + (present && latest ? ' · 最新に追従' : '');
  cell('back', '◀ 前へ · [', 1, back !== index && index >= 0 ? { activation: { type: 'atlas.world.timeline-step', value: -1 } } : { look: 'idle' });
  cell('position', where, 3, { look: 'idle', atlas: { index, count, present, frameId: frame.id } });
  cell('forward', '次へ ▶ · ]', 1, forward !== index && index >= 0 ? { activation: { type: 'atlas.world.timeline-step', value: 1 } } : { look: 'idle' });
  cell('present', '現在へ戻る · L', 1, present && latest ? { look: 'idle' } : { activation: { type: 'atlas.world.latest' } });
  cell('plan', planSummary(plans) + (planOpen ? ' · 閉じる' : ' · 詳細'), 3, { look: 'plan',
    activation: { type: 'atlas.world.plan-toggle' },
    atlas: { plan: plans === null ? 'undeclared' : plans.length ? 'supplied' : 'none', count: plans?.length ?? null, open: planOpen } });

  const region = (id, label, bounds, look, activation, atlas) => Object.freeze({
    regionId: TIMELINE_ID_PREFIX + id, label, bounds: screen(bounds),
    kind: 'timeline', depth: 2, shape: 'graph-node', isGuide: true, readOnly: true,
    geometryEditable: false, labelEditable: false, zIndex: 10003,
    ...(activation ? { activation: Object.freeze(activation) } : {}),
    visual: Object.freeze({ appearance: appearance[look] }),
    atlas: Object.freeze({ kind: 'timeline', part: id, ...atlas }),
  });
  const unit = (strip.width - 6 * (cells.length - 1)) / cells.reduce((sum, item) => sum + item.share, 0);
  let x = strip.x;
  const regions = cells.map(({ id, label, share, activation, look, atlas }) => {
    const width = unit * share;
    const drawn = region(id, label, { x, y: strip.y, width, height: strip.height }, look, activation, atlas);
    x += width + 6;
    return drawn;
  });
  if (planOpen) {
    // Rows stack upward from the strip, each as tall as its wrapped lines.
    let bottom = strip.y - 6;
    const rows = planDetailLines(plans).map(line => wrapLabel(line, strip.width - 32));
    rows.reverse().forEach((label, reversed) => {
      const height = label.split('\n').length * LABEL_LINE_PX + 8;
      bottom -= height;
      regions.push(region('plan-line:' + (rows.length - 1 - reversed), label, { x: strip.x, y: bottom, width: strip.width, height }, 'plan', null,
        { line: rows.length - 1 - reversed }));
      bottom -= 2;
    });
  }
  return Object.freeze(regions);
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
