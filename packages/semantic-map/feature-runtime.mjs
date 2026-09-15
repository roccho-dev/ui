import { createSemanticMap, parseSemanticMapRecords } from './domain/index.js';
import { normalizeOperation } from './domain/authoring-operation.js';
import { SemanticDomainStore } from './domain/authoring-store.js';
import { createGraphLayout, patternConfigKey, validatePatternDomain } from './pattern/index.js';
import { createPresentationProjection, SemanticProjector } from './projection/index.js';
import { defaultViewForPattern } from './protocol/index.js';
import { createSemanticAuthoring } from './renderer-maxgraph/authoring/index.js';

const patterns = Object.freeze({ graph: 'graph/1', map: 'map/1', seq: 'seq/1', chart: 'chart/1' });
const GRAPH_LAYOUT_MODES = new Set(['auto', 'lr', 'tb']);
const GRAPH_AUTO_BREAKPOINT_PX = 720;
const GRAPH_MOBILE_MARGIN_PX = 24;
const invariant = (condition, message) => { if (!condition) throw new Error(`semantic-map-feature: ${message}`); };
const frame = scope => new Promise(resolve => scope.requestAnimationFrame(() => resolve()));

function graphLayoutMode(scope) {
  const mode = new URL(scope.location.href).searchParams.get('layout') ?? 'auto';
  invariant(GRAPH_LAYOUT_MODES.has(mode), `unsupported graph layout ${mode}`);
  return mode;
}

function graphDirection(mode, width) {
  if (mode === 'auto') return width < GRAPH_AUTO_BREAKPOINT_PX ? 'TB' : 'LR';
  return mode.toUpperCase();
}

function graphPresentationProjection(domain, direction) {
  const layout = createGraphLayout(domain, { direction });
  return createPresentationProjection({
    id: `graph-layout-${direction.toLowerCase()}`,
    pattern: 'graph/1',
    layout: [...layout.bounds].map(([regionId, bounds]) => ({ regionId, bounds })),
    interactions: [],
  });
}

function graphLayoutControls(scope, onSelect) {
  const controls = scope.document.createElement('div');
  controls.className = 'semantic-map-layout-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Graph layout');
  const buttons = new Map();
  for (const mode of ['auto', 'lr', 'tb']) {
    const button = scope.document.createElement('button');
    button.type = 'button';
    button.className = 'semantic-map-layout-button';
    button.dataset.layout = mode;
    button.textContent = mode === 'auto' ? 'Auto' : mode.toUpperCase();
    button.addEventListener('click', () => onSelect(mode));
    controls.append(button);
    buttons.set(mode, button);
  }
  return Object.freeze({ controls, buttons });
}

const snapshotDomain = domain => Object.freeze({
  meta: Object.freeze({
    schema: domain.meta.schema,
    root: domain.meta.root,
    title: domain.meta.title,
  }),
  regions: Object.freeze([...domain.regions.values()].map(region => Object.freeze({
    id: region.id,
    parent: region.parent,
    label: region.label,
    kind: region.kind,
    bounds: Object.freeze({ ...region.bounds }),
  }))),
  relations: Object.freeze(domain.relations.map(relation => Object.freeze({ ...relation }))),
});

const prepareRuntimeOperation = (operation, store, scope) => {
  if (operation?.type !== 'ConnectRegions' || Object.hasOwn(operation, 'relationId')) {
    return normalizeOperation(operation);
  }
  invariant(typeof scope.crypto?.randomUUID === 'function', 'crypto.randomUUID is required for relation creation');
  let relationId;
  do relationId = `relation-${scope.crypto.randomUUID()}`;
  while (store.relations.has(relationId));
  return normalizeOperation({ ...operation, relationId });
};

export const mountFeature = async ({ feature, input, root, scope = globalThis }) => {
  invariant(root?.replaceChildren, 'root is required');
  invariant(typeof input === 'string', 'raw JSONL text is required');
  const pattern = patterns[feature?.id];
  invariant(pattern, `unsupported feature ${String(feature?.id)}`);

  const records = parseSemanticMapRecords(input);
  const store = new SemanticDomainStore(createSemanticMap(records));
  let view = feature?.view ?? defaultViewForPattern(pattern);
  invariant(view?.pattern === pattern, `feature view pattern must be ${pattern}`);
  const surface = scope.document.createElement('div');
  surface.className = 'semantic-map-feature';
  surface.dataset.feature = feature.id;
  const canvas = scope.document.createElement('div');
  canvas.className = 'semantic-map-feature-canvas';
  surface.append(canvas);

  let layoutMode = feature.id === 'graph' ? graphLayoutMode(scope) : null;
  let controls = null;
  let buttons = null;
  if (feature.id === 'graph') {
    const shell = scope.document.createElement('div');
    shell.className = 'semantic-map-feature-shell';
    ({ controls, buttons } = graphLayoutControls(scope, (mode) => {
      layoutMode = mode;
      const url = new URL(scope.location.href);
      url.searchParams.set('layout', mode);
      scope.history.replaceState(scope.history.state, '', url);
      renderAndFit();
    }));
    shell.append(controls, surface);
    root.replaceChildren(shell);
  } else {
    root.replaceChildren(surface);
  }
  await frame(scope);

  const adapter = createSemanticAuthoring(canvas);
  let scene = null;
  let renderQueued = false;
  let activeDirection = feature.id === 'graph'
    ? graphDirection(layoutMode, Math.max(1, surface.clientWidth))
    : null;

  const project = () => {
    const presentationProjection = activeDirection
      ? graphPresentationProjection(store.domain, activeDirection)
      : null;
    const projector = new SemanticProjector(store.domain, null, view, { presentationProjection });
    return projector.project({ scale: adapter.camera().scale, viewport: adapter.viewport() });
  };
  const render = () => {
    renderQueued = false;
    scene = project();
    adapter.render(scene);
    return scene;
  };
  const queueRender = () => {
    if (renderQueued) return;
    renderQueued = true;
    scope.requestAnimationFrame(render);
  };
  const updateControls = () => {
    if (!buttons) return;
    for (const [mode, button] of buttons) {
      const selected = mode === layoutMode;
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.dataset.selected = selected ? 'true' : 'false';
    }
  };

  function renderAndFit() {
    surface.style.removeProperty('height');
    const width = Math.max(1, surface.clientWidth);
    activeDirection = feature.id === 'graph' ? graphDirection(layoutMode, width) : null;
    render();

    const bounds = scene.bounds;
    const mobileTopDown = activeDirection === 'TB' && width < GRAPH_AUTO_BREAKPOINT_PX;
    let height = Math.max(1, surface.clientHeight);
    let scale;
    let translateY;

    if (mobileTopDown) {
      scale = Math.max(0.01, Math.min(1, Math.max(1, width - GRAPH_MOBILE_MARGIN_PX) / Math.max(1, bounds.width)));
      const renderedHeight = Math.ceil(bounds.height * scale + GRAPH_MOBILE_MARGIN_PX * 2);
      surface.style.height = `${Math.max(680, renderedHeight)}px`;
      height = Math.max(1, surface.clientHeight);
      translateY = GRAPH_MOBILE_MARGIN_PX / scale - bounds.y;
    } else {
      scale = Math.max(0.01, Math.min(
        1,
        Math.max(1, width - 48) / Math.max(1, bounds.width),
        Math.max(1, height - 48) / Math.max(1, bounds.height),
      ));
      translateY = height / (2 * scale) - (bounds.y + bounds.height / 2);
    }

    const translateX = width / (2 * scale) - (bounds.x + bounds.width / 2);
    adapter.setCamera(scale, translateX, translateY);
    render();

    if (layoutMode) {
      surface.dataset.layout = layoutMode;
      surface.dataset.layoutDirection = activeDirection;
      surface.dataset.fit = mobileTopDown ? 'width' : 'contain';
    }
    updateControls();
  }

  adapter.setOperationHandler(operation => {
    const prepared = prepareRuntimeOperation(operation, store, scope);
    const configKey = patternConfigKey(view.pattern);
    const batch = store.performBatch([prepared], candidate => validatePatternDomain(
      candidate.domain,
      view.pattern,
      configKey === null ? null : view[configKey],
    ));
    return batch.results[0];
  });
  adapter.setActivationHandler(activation => {
    invariant(activation?.kind === 'set-view', `unsupported activation ${String(activation?.kind)}`);
    const nextView = activation.view;
    invariant(nextView?.pattern === pattern, `activation view pattern must be ${pattern}`);
    const configKey = patternConfigKey(nextView.pattern);
    validatePatternDomain(
      store.domain,
      nextView.pattern,
      configKey === null ? null : nextView[configKey],
    );
    const previousView = view;
    view = nextView;
    try {
      const nextScene = render();
      return Object.freeze({ kind: 'set-view', pattern: nextScene.pattern });
    } catch (error) {
      view = previousView;
      render();
      throw error;
    }
  });
  adapter.setErrorHandler(queueRender);
  store.onChange(queueRender);
  adapter.setTool('select');

  renderAndFit();

  if (feature.id === 'graph' && typeof scope.addEventListener === 'function') {
    scope.addEventListener('resize', () => {
      if (layoutMode !== 'auto') return;
      const nextDirection = graphDirection(layoutMode, Math.max(1, surface.clientWidth));
      if (nextDirection !== activeDirection) renderAndFit();
    });
  }

  const editor = Object.freeze({
    adapter,
    store,
    undo: () => store.undo(),
    redo: () => store.redo(),
    deleteSelection: () => adapter.deleteSelection(),
    operation: operation => adapter.submitOperation(operation),
    snapshot: () => Object.freeze({
      domain: snapshotDomain(store.domain),
      draft: store.draftSnapshot(),
      scene: scene ? Object.freeze({ pattern: scene.pattern }) : null,
      selection: adapter.selectionSnapshot(),
    }),
  });
  scope.semanticMapSite = Object.freeze({ ready: true, error: null, editor });

  scope.document.addEventListener('keydown', event => {
    const target = event.target;
    const textInput = target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
      || target?.isContentEditable;
    if (textInput || event.altKey) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
      return;
    }
    if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      editor.redo();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      editor.deleteSelection();
    }
  });

  const svg = Boolean(canvas.querySelector('svg'));
  invariant(svg, 'rendered SVG is missing');
  const activeList = adapter.activeList?.snapshot?.() ?? null;
  invariant(activeList?.visible === true && activeList.items.length > 0, 'shared authoring active-list is not hydrated');
  return Object.freeze({
    schema: 'semantic-map-feature-receipt/1',
    feature: feature.id,
    pattern: scene.pattern,
    records: records.length,
    svg,
    authoring: true,
    activeItems: activeList.items.length,
  });
};
