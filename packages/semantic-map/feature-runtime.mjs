import { createSemanticMap, parseSemanticMapRecords } from './domain/index.js';
import { normalizeOperation } from './domain/authoring-operation.js';
import { SemanticDomainStore } from './domain/authoring-store.js';
import { patternConfigKey, validatePatternDomain } from './pattern/index.js';
import { mountSemanticMapSurface } from './surface-runtime.mjs';

const patterns = Object.freeze({ graph: 'graph/1', map: 'map/1', seq: 'seq/1' });
const invariant = (condition, message) => { if (!condition) throw new Error(`semantic-map-feature: ${message}`); };

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
  const surface = await mountSemanticMapSurface({
    featureId: feature.id,
    mode: 'authoring',
    pattern,
    root,
    scope,
    store,
  });
  const { adapter, canvas, view } = surface;

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
  adapter.setErrorHandler(surface.queueRender);
  adapter.setTool('select');

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
      scene: surface.scene() ? Object.freeze({ pattern: surface.scene().pattern }) : null,
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
  const scene = surface.scene();
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
