import { createIncrementalSurfaceRuntime } from '../a2ui-browser/src/incremental-surface.mjs';
import { validateProfiledBusinessModelSequence } from './compiler/sequence.mjs';
import { PROFILED_BUSINESS_MODEL_SURFACE_ID } from './contracts.mjs';
import { createProfiledBusinessModelCatalog } from './render/catalog.mjs';

const invariant = (condition, message) => { if (!condition) throw new Error(`presentation: ${message}`); };
const element = (document, tag, id = null, className = '') => {
  const node = document.createElement(tag);
  if (id) node.id = id;
  if (className) node.className = className;
  return node;
};

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

export const mountFeature = async ({ input: payload, root, scope = globalThis, seqView }) => {
  invariant(payload?.schema === 'business-model-presentation-runtime-payload/1', 'payload schema is invalid');
  const sequence = validateProfiledBusinessModelSequence(payload.sequence);
  invariant(payload.stageFocus && typeof payload.stageFocus === 'object', 'stage focus is missing');
  invariant(payload.stageLabels && typeof payload.stageLabels === 'object', 'stage labels are missing');
  invariant(typeof seqView?.mount === 'function', 'seq view is required');

  const document = root.ownerDocument;
  const ui = createShell(document, root);
  const catalog = createProfiledBusinessModelCatalog();
  let runtime = null;
  let seq = null;
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
  const refreshSeqLayout = () => scope.queueMicrotask(() => seq?.fit());
  const closeSeq = () => { expanded = false; preview = false; setShellState(); refreshSeqLayout(); };
  const openSeq = () => {
    expanded = true;
    preview = false;
    setShellState();
    refreshSeqLayout();
    scope.queueMicrotask(() => ui.close.focus());
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
    if (index > currentStageIndex) {
      for (let cursor = currentStageIndex + 1; cursor <= index; cursor += 1) runtime.apply(sequence.stages[cursor].messages);
    }
    currentStageIndex = index;
    document.documentElement.dataset.stage = stage.id;
    ui.current.textContent = payload.stageLabels[stage.id] ?? stage.id;
    seq?.focus(payload.stageFocus[stage.id]);
    if (focus) scope.queueMicrotask(() => ui.surface.querySelectorAll('.profiled-timeline button')[index]?.focus());
    return runtime.read();
  };
  const activateSeqRegion = regionId => {
    const stageId = stageByFocus.get(regionId);
    const index = stageIndexById.get(stageId);
    if (!Number.isSafeInteger(index)) return false;
    applyStage(index);
    closeSeq();
    return true;
  };

  seq = await seqView.mount({ root: ui.mount, scope, onActivate: activateSeqRegion });
  const stageAction = event => {
    if (event.detail?.action !== 'business-model-profiled.select-stage') return;
    const index = event.detail.context?.index;
    if (Number.isSafeInteger(index)) applyStage(index, { focus: event.detail.context?.focus === true });
  };
  scope.addEventListener('a2ui-client-action', stageAction);
  const canHover = scope.matchMedia('(hover:hover) and (pointer:fine)');
  ui.shell.addEventListener('mouseenter', () => {
    if (canHover.matches && !expanded) { preview = true; setShellState(); refreshSeqLayout(); }
  });
  ui.shell.addEventListener('mouseleave', () => {
    if (!expanded) { preview = false; setShellState(); refreshSeqLayout(); }
  });
  ui.shell.addEventListener('transitionend', () => seq?.fit());
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
    read: () => Object.freeze({ currentStageIndex, expanded, preview, runtime: runtime.read(), seq: seq.read() }),
    schema: 'ui-presentation-runtime/1',
  });
};
