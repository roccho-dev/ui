import { createGraphLayout } from './pattern/index.js';
import { createPresentationProjection, SemanticProjector } from './projection/index.js';
import { defaultViewForPattern } from './protocol/index.js';
import { createMaxGraphAdapter } from './renderer-maxgraph/adapter.js';
import { createSemanticAuthoring } from './renderer-maxgraph/authoring/index.js';

const invariant = (condition, message) => { if (!condition) throw new Error(`semantic-map-surface: ${message}`); };
const frame = scope => new Promise(resolve => scope.requestAnimationFrame(() => resolve()));
const GRAPH_LAYOUT_MODES = new Set(['auto', 'lr', 'tb']);
const GRAPH_AUTO_BREAKPOINT_PX = 720;
const GRAPH_MOBILE_MARGIN_PX = 24;

const createViewAdapter = container => {
  const adapter = createMaxGraphAdapter(container);
  adapter.graph.setCellsMovable(false);
  adapter.graph.setCellsResizable(false);
  adapter.graph.setCellsEditable(false);
  adapter.graph.setCellsDisconnectable(false);
  adapter.graph.getPlugin('ConnectionHandler')?.setEnabled(false);
  adapter.graph.getPlugin('RubberBandHandler')?.setEnabled(false);
  return adapter;
};

const graphLayoutMode = scope => {
  const mode = new URL(scope.location.href).searchParams.get('layout') ?? 'auto';
  invariant(GRAPH_LAYOUT_MODES.has(mode), `unsupported graph layout ${mode}`);
  return mode;
};

const graphDirection = (mode, width) => {
  if (mode === 'auto') return width < GRAPH_AUTO_BREAKPOINT_PX ? 'TB' : 'LR';
  return mode.toUpperCase();
};

const graphPresentationProjection = (domain, direction) => {
  const layout = createGraphLayout(domain, { direction });
  return createPresentationProjection({
    id: `graph-layout-${direction.toLowerCase()}`,
    pattern: 'graph/1',
    layout: [...layout.bounds].map(([regionId, bounds]) => ({ regionId, bounds })),
    interactions: [],
  });
};

const graphLayoutControls = (scope, onSelect) => {
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
};

export const mountSemanticMapSurface = async ({
  featureId,
  pattern,
  root,
  scope = globalThis,
  store,
  mode = 'view',
}) => {
  invariant(root?.replaceChildren, 'root is required');
  invariant(store?.domain, 'store is required');
  invariant(['authoring', 'view'].includes(mode), `unsupported mode ${String(mode)}`);
  const view = defaultViewForPattern(pattern);
  const document = root.ownerDocument;
  const surface = document.createElement('div');
  surface.className = 'semantic-map-feature';
  surface.dataset.feature = featureId;
  const canvas = document.createElement('div');
  canvas.className = 'semantic-map-feature-canvas';
  surface.append(canvas);

  let layoutMode = featureId === 'graph' ? graphLayoutMode(scope) : null;
  let buttons = null;
  if (featureId === 'graph') {
    const shell = document.createElement('div');
    shell.className = 'semantic-map-feature-shell';
    const controls = graphLayoutControls(scope, selected => {
      layoutMode = selected;
      const url = new URL(scope.location.href);
      url.searchParams.set('layout', selected);
      scope.history.replaceState(scope.history.state, '', url);
      renderAndFit();
    });
    buttons = controls.buttons;
    shell.append(controls.controls, surface);
    root.replaceChildren(shell);
  } else {
    root.replaceChildren(surface);
  }
  await frame(scope);

  const adapter = mode === 'authoring' ? createSemanticAuthoring(canvas) : createViewAdapter(canvas);
  let scene = null;
  let renderQueued = false;
  let activeDirection = featureId === 'graph'
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
    for (const [value, button] of buttons) {
      const selected = value === layoutMode;
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.dataset.selected = selected ? 'true' : 'false';
    }
  };

  function renderAndFit() {
    surface.style.removeProperty('height');
    const width = Math.max(1, surface.clientWidth);
    activeDirection = featureId === 'graph' ? graphDirection(layoutMode, width) : null;
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
    return scene;
  }

  store.onChange?.(queueRender);
  renderAndFit();

  if (featureId === 'graph' && typeof scope.addEventListener === 'function') {
    scope.addEventListener('resize', () => {
      if (layoutMode !== 'auto') return;
      const nextDirection = graphDirection(layoutMode, Math.max(1, surface.clientWidth));
      if (nextDirection !== activeDirection) renderAndFit();
    });
  }

  return Object.freeze({
    adapter,
    canvas,
    fit: renderAndFit,
    pattern: view.pattern,
    queueRender,
    read: () => Object.freeze({
      camera: adapter.camera(),
      focusMarker: adapter.focusMarkerSnapshot?.() ?? null,
      pattern: scene?.pattern ?? null,
      selection: adapter.selectionSnapshot(),
    }),
    scene: () => scene,
    view,
  });
};
