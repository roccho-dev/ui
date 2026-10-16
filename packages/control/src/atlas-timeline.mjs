// The World timeline: past frames stepped one at a time, one present anchor
// (the latest supplied frame) and a planned layer over the present. A plan is
// never a frame and never a fact; with no supplied plan it is shown as
// undeclared (UNKNOWN), not as an empty future. Pure; no DOM.

export const TIMELINE_ID_PREFIX = 'timeline:';
export const PLAN_UNDECLARED = '予定：計画未宣言（UNKNOWN）';

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
export const projectTimeline = ({
  frames,
  frame,
  latest = true,
  plan = null,
  strip,
  camera = { scale: 1, translateX: 0, translateY: 0 },
} = {}) => {
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
  cell('plan', plan === null ? PLAN_UNDECLARED : String(plan.label), 3, { look: 'plan', atlas: { plan: plan === null ? 'undeclared' : 'supplied' } });

  const unit = (strip.width - 6 * (cells.length - 1)) / cells.reduce((sum, item) => sum + item.share, 0);
  let x = strip.x;
  return Object.freeze(cells.map(({ id, label, share, activation, look, atlas }) => {
    const width = unit * share;
    const region = Object.freeze({
      regionId: TIMELINE_ID_PREFIX + id, label, bounds: screen({ x, y: strip.y, width, height: strip.height }),
      kind: 'timeline', depth: 2, shape: 'graph-node', isGuide: true, readOnly: true,
      geometryEditable: false, labelEditable: false, zIndex: 10003,
      ...(activation ? { activation: Object.freeze(activation) } : {}),
      visual: Object.freeze({ appearance: appearance[look] }),
      atlas: Object.freeze({ kind: 'timeline', part: id, ...atlas }),
    });
    x += width + 6;
    return region;
  }));
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
