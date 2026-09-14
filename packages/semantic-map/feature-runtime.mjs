import { createSemanticMap, parseSemanticMapRecords } from './domain/index.js';
import { createGraphLayout } from './pattern/index.js';
import { createPresentationProjection, SemanticProjector } from './projection/index.js';
import { defaultViewForPattern } from './protocol/index.js';
import { createMaxGraphAdapter } from './renderer-maxgraph/index.js';

const patterns = Object.freeze({ graph: 'graph/1', map: 'map/1', seq: 'seq/1' });
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

export const mountFeature = async ({ feature, input, root, scope = globalThis }) => {
  invariant(root?.replaceChildren, 'root is required');
  invariant(typeof input === 'string', 'raw JSONL text is required');
  const pattern = patterns[feature?.id];
  invariant(pattern, `unsupported feature ${String(feature?.id)}`);

  const records = parseSemanticMapRecords(input);
  const domain = createSemanticMap(records);
  const view = defaultViewForPattern(pattern);
  const surface = scope.document.createElement('div');
  surface.className = 'semantic-map-feature';
  surface.dataset.feature = feature.id;

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

  const adapter = createMaxGraphAdapter(surface);
  adapter.setTool('hand');
  let scene = null;
  let activeDirection = null;

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
    const direction = feature.id === 'graph' ? graphDirection(layoutMode, width) : null;
    const presentationProjection = direction ? graphPresentationProjection(domain, direction) : null;
    const projector = new SemanticProjector(domain, null, view, { presentationProjection });
    const project = () => projector.project({ scale: adapter.camera().scale, viewport: adapter.viewport() });
    scene = project();
    adapter.render(scene);

    const bounds = scene.bounds;
    const mobileTopDown = direction === 'TB' && width < GRAPH_AUTO_BREAKPOINT_PX;
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
    scene = project();
    adapter.render(scene);

    activeDirection = direction;
    if (layoutMode) {
      surface.dataset.layout = layoutMode;
      surface.dataset.layoutDirection = direction;
      surface.dataset.fit = mobileTopDown ? 'width' : 'contain';
    }
    updateControls();
  }

  renderAndFit();

  if (feature.id === 'graph' && typeof scope.addEventListener === 'function') {
    scope.addEventListener('resize', () => {
      if (layoutMode !== 'auto') return;
      const nextDirection = graphDirection(layoutMode, Math.max(1, surface.clientWidth));
      if (nextDirection !== activeDirection) renderAndFit();
    });
  }

  const svg = Boolean(surface.querySelector('svg'));
  invariant(svg, 'rendered SVG is missing');
  return Object.freeze({
    schema: 'semantic-map-feature-receipt/1',
    feature: feature.id,
    pattern: scene.pattern,
    records: records.length,
    svg,
  });
};
