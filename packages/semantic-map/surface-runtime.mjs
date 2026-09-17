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

const graphPresentationProjection = (domain, direction, pins) => {
  const layout = createGraphLayout(domain, { direction, pins });
  return createPresentationProjection({
    id: `graph-layout-${direction.toLowerCase()}`,
    pattern: 'graph/1',
    layout: [...layout.bounds].map(([regionId, bounds]) => ({ regionId, bounds })),
    interactions: [],
  });
};

const withConstraintState = (scene, layoutPins, dataPins) => Object.freeze({
  ...scene,
  representations: Object.freeze(scene.representations.map((representation) => {
    const regionId = representation.sourceRegionId ?? representation.regionId;
    const layoutPinned = !representation.isGuide && representation.mode !== 'boundary' && layoutPins.has(regionId);
    const dataPin = dataPins.get(regionId) ?? null;
    if (!layoutPinned && !dataPin) return representation;
    return Object.freeze({
      ...representation,
      ...(layoutPinned ? { layoutPinned: true } : {}),
      ...(dataPin ? { dataPin } : {}),
    });
  })),
  relations: Object.freeze(scene.relations.map((relation) => {
    const pins = Object.freeze((relation.relationIds ?? []).map(id => dataPins.get(id)).filter(Boolean));
    return pins.length === 0 ? relation : Object.freeze({ ...relation, dataPins: pins });
  })),
});

const graphLayoutControls = (scope, onSelect, onUnpin) => {
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
  const unpinButton = scope.document.createElement('button');
  unpinButton.type = 'button';
  unpinButton.className = 'semantic-map-layout-button';
  unpinButton.dataset.layoutAction = 'unpin';
  unpinButton.textContent = 'Unpin';
  unpinButton.disabled = true;
  unpinButton.addEventListener('click', onUnpin);
  controls.append(unpinButton);
  return Object.freeze({ controls, buttons, unpinButton });
};

export const mountSemanticMapSurface = async ({
  featureId,
  pattern,
  root,
  scope = globalThis,
  store,
  mode = 'view',
  view: initialView = null,
  modules = null,
}) => {
  invariant(root?.replaceChildren, 'root is required');
  invariant(store?.domain, 'store is required');
  invariant(['authoring', 'view'].includes(mode), `unsupported mode ${String(mode)}`);
  let view = initialView ?? defaultViewForPattern(pattern);
  invariant(view?.pattern === pattern, `view pattern must be ${pattern}`);
  const document = root.ownerDocument;
  const surface = document.createElement('div');
  surface.className = 'semantic-map-feature';
  surface.dataset.feature = featureId;
  const canvas = document.createElement('div');
  canvas.id = 'graph-container';
  canvas.className = 'semantic-map-feature-canvas';
  surface.append(canvas);

  let adapter = null;
  let layoutMode = featureId === 'graph' ? graphLayoutMode(scope) : null;
  let buttons = null;
  let unpinButton = null;
  if (featureId === 'graph') {
    const shell = document.createElement('div');
    shell.className = 'semantic-map-feature-shell';
    const controls = graphLayoutControls(scope, selected => {
      layoutMode = selected;
      const url = new URL(scope.location.href);
      url.searchParams.set('layout', selected);
      scope.history.replaceState(scope.history.state, '', url);
      renderAndFit();
    }, () => {
      const regionIds = adapter?.selectionSnapshot().regionIds ?? [];
      if (regionIds.length === 0) return;
      adapter.submitOperation({ type: 'UnpinRegions', regionIds });
    });
    buttons = controls.buttons;
    unpinButton = controls.unpinButton;
    shell.append(controls.controls, surface);
    root.replaceChildren(shell);
  } else {
    root.replaceChildren(surface);
  }
  await frame(scope);

  adapter = mode === 'authoring' ? createSemanticAuthoring(canvas) : createViewAdapter(canvas);
  let scene = null;
  let renderQueued = false;
  let activeModules = modules;
  let activeDirection = featureId === 'graph'
    ? graphDirection(layoutMode, Math.max(1, surface.clientWidth))
    : null;

  const projectDomain = (domain, candidateView = view, resolvedModules = activeModules) => {
    const graph = featureId === 'graph' && candidateView.pattern === 'graph/1';
    const layoutPins = graph ? (store.layoutHints ?? new Map()) : new Map();
    const dataPins = store.dataPins ?? new Map();
    const presentationProjection = graph
      ? graphPresentationProjection(domain, activeDirection, layoutPins)
      : null;
    const projector = new SemanticProjector(domain, resolvedModules, candidateView, { presentationProjection });
    const projected = projector.project({ scale: adapter.camera().scale, viewport: adapter.viewport() });
    return withConstraintState(projected, layoutPins, dataPins);
  };
  const project = () => projectDomain(store.domain, view, activeModules);
  const updateControls = () => {
    if (buttons) {
      for (const [value, button] of buttons) {
        const selected = value === layoutMode;
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        button.dataset.selected = selected ? 'true' : 'false';
      }
    }
    if (unpinButton) {
      const selection = adapter?.selectionSnapshot().regionIds ?? [];
      const pins = store.layoutHints ?? new Map();
      unpinButton.disabled = !selection.some((regionId) => pins.has(regionId));
    }
  };
  const render = () => {
    renderQueued = false;
    scene = project();
    adapter.render(scene);
    updateControls();
    return scene;
  };
  const queueRender = () => {
    if (renderQueued) return;
    renderQueued = true;
    scope.requestAnimationFrame(render);
  };
  const setModules = next => {
    activeModules = next;
    return render();
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
    return scene;
  }

  const setView = nextView => {
    invariant(nextView?.pattern === pattern, `view pattern must be ${pattern}`);
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
  };

  store.onChange?.(queueRender);
  adapter.onSelectionChange?.(updateControls);
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
    projectDomain,
    queueRender,
    read: () => Object.freeze({
      camera: adapter.camera(),
      focusMarker: adapter.focusMarkerSnapshot?.() ?? null,
      pattern: scene?.pattern ?? null,
      selection: adapter.selectionSnapshot(),
    }),
    scene: () => scene,
    setModules,
    setView,
    get view() { return view; },
  });
};
