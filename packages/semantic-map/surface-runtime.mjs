import { defaultViewForPattern } from './protocol/index.js';
import { SemanticProjector } from './projection/index.js';
import { createMaxGraphAdapter } from './renderer-maxgraph/adapter.js';
import { createSemanticAuthoring } from './renderer-maxgraph/authoring/index.js';

const invariant = (condition, message) => { if (!condition) throw new Error(`semantic-map-surface: ${message}`); };
const frame = scope => new Promise(resolve => scope.requestAnimationFrame(() => resolve()));

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
  root.replaceChildren(surface);
  await frame(scope);

  const adapter = mode === 'authoring' ? createSemanticAuthoring(canvas) : createViewAdapter(canvas);
  const projector = new SemanticProjector(store.domain, null, view);
  let scene = null;
  let renderQueued = false;

  const project = () => {
    projector.setDomain(store.domain);
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
  const fit = () => {
    const current = render();
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const bounds = current.bounds;
    const scale = Math.max(0.01, Math.min(
      1,
      Math.max(1, width - 48) / Math.max(1, bounds.width),
      Math.max(1, height - 48) / Math.max(1, bounds.height),
    ));
    const translateX = width / (2 * scale) - (bounds.x + bounds.width / 2);
    const translateY = height / (2 * scale) - (bounds.y + bounds.height / 2);
    adapter.setCamera(scale, translateX, translateY);
    return render();
  };

  store.onChange?.(queueRender);
  fit();

  return Object.freeze({
    adapter,
    canvas,
    fit,
    pattern: view.pattern,
    queueRender,
    read: () => Object.freeze({
      camera: adapter.camera(),
      pattern: scene?.pattern ?? null,
      selection: adapter.selectionSnapshot(),
    }),
    scene: () => scene,
    view,
  });
};
