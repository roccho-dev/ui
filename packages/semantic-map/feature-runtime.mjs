import { createSemanticMap, parseSemanticMapRecords } from './domain/index.js';
import { normalizeOperation } from './domain/authoring-operation.js';
import { SemanticDomainStore } from './domain/authoring-store.js';
import { patternConfigKey, validatePatternDomain } from './pattern/index.js';
import { SemanticProjector } from './projection/index.js';
import { defaultViewForPattern } from './protocol/index.js';
import { createSemanticAuthoring } from './renderer-maxgraph/authoring/index.js';

const patterns = Object.freeze({ graph: 'graph/1', map: 'map/1', seq: 'seq/1' });
const invariant = (condition, message) => { if (!condition) throw new Error(`semantic-map-feature: ${message}`); };
const frame = scope => new Promise(resolve => scope.requestAnimationFrame(() => resolve()));

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

export const mountFeature = async ({ feature, input, root, scope = globalThis }) => {
  invariant(root?.replaceChildren, 'root is required');
  invariant(typeof input === 'string', 'raw JSONL text is required');
  const pattern = patterns[feature?.id];
  invariant(pattern, `unsupported feature ${String(feature?.id)}`);

  const records = parseSemanticMapRecords(input);
  const store = new SemanticDomainStore(createSemanticMap(records));
  const view = defaultViewForPattern(pattern);
  const surface = scope.document.createElement('div');
  surface.className = 'semantic-map-feature';
  surface.dataset.feature = feature.id;
  const canvas = scope.document.createElement('div');
  canvas.className = 'semantic-map-feature-canvas';
  surface.append(canvas);
  root.replaceChildren(surface);
  await frame(scope);

  const adapter = createSemanticAuthoring(canvas);
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

  adapter.setOperationHandler(operation => {
    const prepared = normalizeOperation(operation);
    const configKey = patternConfigKey(view.pattern);
    const batch = store.performBatch([prepared], candidate => validatePatternDomain(
      candidate.domain,
      view.pattern,
      configKey === null ? null : view[configKey],
    ));
    return batch.results[0];
  });
  adapter.setErrorHandler(queueRender);
  store.onChange(queueRender);
  adapter.setTool('select');

  render();
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const bounds = scene.bounds;
  const scale = Math.max(0.01, Math.min(
    1,
    Math.max(1, width - 48) / Math.max(1, bounds.width),
    Math.max(1, height - 48) / Math.max(1, bounds.height),
  ));
  const translateX = width / (2 * scale) - (bounds.x + bounds.width / 2);
  const translateY = height / (2 * scale) - (bounds.y + bounds.height / 2);
  adapter.setCamera(scale, translateX, translateY);
  render();

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
