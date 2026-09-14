import { createIncrementalSurfaceRuntime } from '../a2ui-browser/src/incremental-surface.mjs';
import { validateProfiledBusinessModelSequence } from './compiler/sequence.mjs';
import { PROFILED_BUSINESS_MODEL_SURFACE_ID } from './contracts.mjs';
import { createProfiledBusinessModelCatalog } from './render/catalog.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const invariant = (condition, message) => { if (!condition) throw new Error(`presentation: ${message}`); };
const element = (document, tag, id = null, className = '') => {
  const node = document.createElement(tag);
  if (id) node.id = id;
  if (className) node.className = className;
  return node;
};
const svgNode = (document, tag, attributes = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
};
const center = region => ({ x: region.bounds[0] + region.bounds[2] / 2, y: region.bounds[1] + region.bounds[3] / 2 });
const labelLines = (label, max = 15) => label.length <= max ? [label] : [label.slice(0, max), label.slice(max, max * 2)];

const createShell = (document, root) => {
  const surface = element(document, 'main', 'surface');
  surface.setAttribute('aria-label', 'A2UI Slides');
  const backdrop = element(document, 'div', 'seq-backdrop', 'seq-backdrop');
  backdrop.dataset.open = 'false';
  backdrop.setAttribute('aria-hidden', 'true');
  const shell = element(document, 'aside', 'seq-shell', 'seq-shell');
  shell.dataset.preview = 'false';
  shell.dataset.expanded = 'false';
  shell.setAttribute('aria-label', '主体別Seq');
  shell.setAttribute('role', 'complementary');
  const toolbar = element(document, 'div', null, 'seq-toolbar');
  const identity = element(document, 'div', null, 'seq-identity');
  const marker = element(document, 'span', null, 'seq-marker');
  marker.setAttribute('aria-hidden', 'true');
  const labels = element(document, 'div', null, 'seq-labels');
  const kind = element(document, 'span', null, 'seq-kind');
  kind.textContent = 'Actor Seq';
  const current = element(document, 'strong', 'seq-current', 'seq-current');
  labels.append(kind, current);
  identity.append(marker, labels);
  const close = element(document, 'button', 'seq-close', 'seq-close');
  close.type = 'button';
  close.hidden = true;
  close.setAttribute('aria-label', 'Seqを閉じる');
  close.textContent = '×';
  toolbar.append(identity, close);
  const mount = element(document, 'div', 'seq-mount', 'seq-mount');
  const open = element(document, 'button', 'seq-open', 'seq-open');
  open.type = 'button';
  open.setAttribute('aria-expanded', 'false');
  open.setAttribute('aria-label', '主体別Seqを開く');
  const openLabel = element(document, 'span');
  openLabel.textContent = 'Open Seq ↗';
  open.append(openLabel);
  shell.append(toolbar, mount, open);
  root.replaceChildren(surface, backdrop, shell);
  return Object.freeze({ backdrop, close, current, mount, open, shell, surface });
};

export const mountFeature = async ({ input: payload, root, scope = globalThis }) => {
  invariant(payload?.schema === 'business-model-presentation-minimal-payload/1', 'payload schema is invalid');
  invariant(payload.coverage?.pass === true, 'projection coverage did not pass');
  const sequence = validateProfiledBusinessModelSequence(payload.sequence);
  invariant(Array.isArray(payload.seqState) && payload.seqState.length > 0, 'seq state is missing');
  invariant(payload.stageFocus && typeof payload.stageFocus === 'object', 'stage focus is missing');
  invariant(payload.stageLabels && typeof payload.stageLabels === 'object', 'stage labels are missing');

  const document = root.ownerDocument;
  const ui = createShell(document, root);
  const catalog = createProfiledBusinessModelCatalog();
  let runtime = null;
  let currentStageIndex = -1;
  let expanded = false;
  let preview = false;
  const stageByFocus = new Map(Object.entries(payload.stageFocus).map(([stageId, focusRef]) => [focusRef, stageId]));
  const stageIndexById = new Map(sequence.stages.map((stage, index) => [stage.id, index]));

  const setShellState = () => {
    ui.shell.dataset.preview = String(preview && !expanded);
    ui.shell.dataset.expanded = String(expanded);
    ui.backdrop.dataset.open = String(expanded);
    ui.backdrop.setAttribute('aria-hidden', String(!expanded));
    ui.open.setAttribute('aria-expanded', String(expanded));
    ui.close.hidden = !expanded;
    document.body.classList.toggle('seq-expanded', expanded);
  };
  const closeSeq = () => { expanded = false; preview = false; setShellState(); };
  const openSeq = () => { expanded = true; preview = false; setShellState(); scope.queueMicrotask(() => ui.close.focus()); };
  const appendLabel = (svg, x, y, value, className = '') => {
    const text = svgNode(document, 'text', { x, y, 'text-anchor': 'middle', class: className });
    labelLines(value).forEach((line, index) => {
      const span = svgNode(document, 'tspan', { x, dy: index === 0 ? 0 : 14 });
      span.textContent = line;
      text.append(span);
    });
    svg.append(text);
  };

  const renderSeq = () => {
    const records = payload.seqState;
    const regions = records.filter(record => record.type === 'region');
    const relations = records.filter(record => record.type === 'relation' && record.kind === 'next');
    const seqRoot = regions.find(region => region.parent === null);
    invariant(seqRoot, 'seq root region is missing');
    const regionById = new Map(regions.map(region => [region.id, region]));
    const stage = sequence.stages[currentStageIndex];
    const focusRef = payload.stageFocus[stage.id];
    const svg = svgNode(document, 'svg', {
      class: 'seq-svg', viewBox: `0 0 ${seqRoot.bounds[2]} ${seqRoot.bounds[3]}`, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': `${payload.label}の主体別Seq`,
    });
    const defs = svgNode(document, 'defs');
    const arrow = svgNode(document, 'marker', { id: 'seq-arrow', markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: 'auto', markerUnits: 'strokeWidth' });
    arrow.append(svgNode(document, 'path', { d: 'M0,0 L8,4 L0,8 z', fill: '#71808b' }));
    const arrowDone = svgNode(document, 'marker', { id: 'seq-arrow-done', markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: 'auto', markerUnits: 'strokeWidth' });
    arrowDone.append(svgNode(document, 'path', { d: 'M0,0 L8,4 L0,8 z', fill: '#2f6848' }));
    defs.append(arrow, arrowDone);
    svg.append(defs);
    for (const actor of regions.filter(region => region.kind === 'actor')) {
      const [, y, , height] = actor.bounds;
      svg.append(svgNode(document, 'rect', { x: 220, y, width: seqRoot.bounds[2] - 240, height, rx: 8, class: 'seq-lane-bg' }));
    }
    for (const relation of relations) {
      const from = regionById.get(relation.from);
      const to = regionById.get(relation.to);
      if (!from || !to) continue;
      const a = center(from);
      const b = center(to);
      const active = from.id === focusRef || to.id === focusRef;
      const line = svgNode(document, 'line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: `seq-edge${active ? ' active' : ''}` });
      line.dataset.recordId = relation.id;
      svg.append(line);
      appendLabel(svg, (a.x + b.x) / 2, (a.y + b.y) / 2 - 7, relation.label, 'seq-edge-label');
    }
    for (const region of regions.filter(item => item.parent !== null)) {
      const [x, y, width, height] = region.bounds;
      const isFocus = region.id === focusRef;
      const isStageNode = stageByFocus.has(region.id);
      const group = svgNode(document, 'g', {
        class: `seq-region seq-${region.kind}${isFocus ? ' current' : ''}${isStageNode ? ' navigable' : ''}`,
        tabindex: isStageNode ? 0 : -1,
        role: isStageNode ? 'button' : 'group',
        'aria-label': region.label,
      });
      group.dataset.recordId = region.id;
      group.append(svgNode(document, 'rect', { x, y, width, height, rx: region.kind === 'actor' ? 8 : 4 }));
      const text = svgNode(document, 'text', { x: x + width / 2, y: y + Math.min(27, height / 2), 'text-anchor': 'middle' });
      labelLines(region.label, 14).forEach((line, index) => {
        const span = svgNode(document, 'tspan', { x: x + width / 2, dy: index === 0 ? 0 : 14 });
        span.textContent = line;
        text.append(span);
      });
      group.append(text);
      if (isFocus) group.append(svgNode(document, 'rect', { x: x + 7, y: y + 7, width: 11, height: 11, class: 'seq-current-marker' }));
      if (isStageNode) group.dataset.stageId = stageByFocus.get(region.id);
      svg.append(group);
    }
    ui.mount.replaceChildren(svg);
    ui.current.textContent = payload.stageLabels[stage.id] ?? stage.id;
  };

  const createRuntime = () => {
    ui.surface.replaceChildren();
    runtime = createIncrementalSurfaceRuntime({
      catalog,
      catalogId: sequence.catalogId,
      document,
      eventTarget: scope,
      mount: ui.surface,
      requiredRootIds: ['root'],
      rootId: 'root',
      surfaceId: PROFILED_BUSINESS_MODEL_SURFACE_ID,
    });
    currentStageIndex = -1;
  };
  const applyStage = (index, { focus = false } = {}) => {
    const stage = sequence.stages[index];
    invariant(stage, `stage is missing: ${index}`);
    if (!runtime || index < currentStageIndex) createRuntime();
    if (index > currentStageIndex) for (let cursor = currentStageIndex + 1; cursor <= index; cursor += 1) runtime.apply(sequence.stages[cursor].messages);
    currentStageIndex = index;
    document.documentElement.dataset.stage = stage.id;
    renderSeq();
    if (focus) scope.queueMicrotask(() => ui.surface.querySelectorAll('.profiled-timeline button')[index]?.focus());
    return runtime.read();
  };

  const stageAction = event => {
    if (event.detail?.action !== 'business-model-profiled.select-stage') return;
    const index = event.detail.context?.index;
    if (Number.isSafeInteger(index)) applyStage(index, { focus: event.detail.context?.focus === true });
  };
  scope.addEventListener('a2ui-client-action', stageAction);
  const canHover = scope.matchMedia('(hover:hover) and (pointer:fine)');
  ui.shell.addEventListener('mouseenter', () => { if (canHover.matches && !expanded) { preview = true; setShellState(); } });
  ui.shell.addEventListener('mouseleave', () => { if (!expanded) { preview = false; setShellState(); } });
  const activateSeqTarget = target => {
    const group = target?.closest?.('.seq-region[data-stage-id]');
    if (!group) return false;
    const index = stageIndexById.get(group.dataset.stageId);
    if (!Number.isSafeInteger(index)) return false;
    applyStage(index);
    closeSeq();
    return true;
  };
  ui.mount.addEventListener('click', event => { activateSeqTarget(event.target); });
  ui.mount.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && activateSeqTarget(event.target)) event.preventDefault();
  });
  ui.open.addEventListener('click', openSeq);
  ui.close.addEventListener('click', closeSeq);
  ui.backdrop.addEventListener('click', closeSeq);

  applyStage(0);
  setShellState();
  document.documentElement.dataset.status = 'pass';
  return Object.freeze({
    applyStage,
    closeSeq,
    openSeq,
    read: () => Object.freeze({ currentStageIndex, expanded, preview, runtime: runtime.read() }),
    schema: 'ui-presentation-runtime/1',
  });
};
