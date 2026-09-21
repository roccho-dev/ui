import {
  normalizeDataPinRecords,
  splitDataPinRecords,
  targetIdsFromRecords,
} from '../data-pin/contract.mjs';
import { mountDataPinControls } from './data-pin-controls.mjs';
import { createSemanticMap } from './domain/index.js';
import { SemanticDomainStore } from './domain/authoring-store.js';
import { normalizeLayoutRecords, splitStateRecords } from './layout/state.js';
import { ModuleResolver } from './module-embedding/index.js';
import { patternConfigKey, validatePatternDomain } from './pattern/index.js';
import {
  ENVELOPE_SCHEMA,
  appendDecision,
  createDecision,
  createDecisionLog,
  createEnvelope,
  defaultViewForPattern,
  inspectEnvelope,
} from './protocol/index.js';
import { parseStateJSONL } from './protocol/input-jsonl.js';
import { validateSceneGraph } from './projection/index.js';
import { mountSemanticMapSurface } from './surface-runtime.mjs';
import { DecisionRuntime } from './authoring/runtime.js';
import { waitFor } from './authoring/shared.js';

const patterns = Object.freeze({ graph: 'graph/1', map: 'map/1', seq: 'seq/1', chart: 'chart/1' });
const invariant = (condition, message) => { if (!condition) throw new Error(`semantic-map-feature: ${message}`); };

const snapshotDomain = domain => Object.freeze({
  meta: Object.freeze({ schema: domain.meta.schema, root: domain.meta.root, title: domain.meta.title }),
  regions: Object.freeze([...domain.regions.values()].map(region => Object.freeze({
    id: region.id, parent: region.parent, label: region.label, kind: region.kind, bounds: Object.freeze({ ...region.bounds }),
  }))),
  relations: Object.freeze(domain.relations.map(relation => Object.freeze({ ...relation }))),
});

const stateParts = records => {
  const { dataRecords, dataPinRecords } = splitDataPinRecords(records);
  const { semanticRecords, layoutRecords } = splitStateRecords(dataRecords);
  const domain = createSemanticMap(semanticRecords);
  return Object.freeze({
    domain,
    layoutRecords: normalizeLayoutRecords(layoutRecords, domain),
    dataPinRecords: normalizeDataPinRecords(
      dataPinRecords,
      dataPinRecords.length > 0 ? targetIdsFromRecords(semanticRecords) : null,
    ),
  });
};

const bootstrapEnvelope = async ({ input, view, scope }) => {
  if (typeof input === 'string') {
    invariant(typeof scope.crypto?.randomUUID === 'function', 'crypto.randomUUID is required');
    const records = parseStateJSONL(input);
    const { dataRecords, dataPinRecords } = splitDataPinRecords(records);
    const { semanticRecords, layoutRecords } = splitStateRecords(dataRecords);
    let created = await createDecisionLog(semanticRecords, `urn:uuid:${scope.crypto.randomUUID()}`);
    const constraintOperations = [];
    if (dataPinRecords.length > 0) {
      constraintOperations.push({
        type: 'PinData',
        items: dataPinRecords.map(record => ({
          targetId: record.targetId,
          basis: record.basis,
          reason: record.reason,
        })),
      });
    }
    if (layoutRecords.length > 0) {
      constraintOperations.push({
        type: 'PinRegions',
        items: layoutRecords.map(record => ({ regionId: record.regionId, bounds: record.bounds })),
      });
    }
    if (constraintOperations.length > 0) {
      const constraintDecision = await createDecision(created.head, constraintOperations, created.records);
      created = await appendDecision(created.log, constraintDecision.decision);
    }
    return createEnvelope(created.log, null, view);
  }
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'data must be raw JSONL text or an Envelope');
  invariant(input.schema === ENVELOPE_SCHEMA, `data schema must be ${ENVELOPE_SCHEMA}`);
  return (await inspectEnvelope(input)).envelope;
};

const graphAuthoringOperation = (operation, scene) => {
  if (scene?.pattern !== 'graph/1') return operation;
  if (operation.type === 'ResizeRegions') {
    return Object.freeze({
      type: 'PinRegions',
      items: operation.items.map(item => Object.freeze({ regionId: item.regionId, bounds: item.bounds })),
    });
  }
  if (operation.type !== 'MoveRegions') return operation;
  const visible = new Map(
    scene.representations
      .filter(item => item.mode !== 'boundary' && item.sourceRegionId)
      .map(item => [item.sourceRegionId, item]),
  );
  return Object.freeze({
    type: 'PinRegions',
    items: operation.regionIds.map(regionId => {
      const representation = visible.get(regionId);
      invariant(representation, `graph pin source is not visible: ${regionId}`);
      const { x, y, width, height } = representation.bounds;
      return Object.freeze({
        regionId,
        bounds: Object.freeze([x + operation.dx, y + operation.dy, width, height]),
      });
    }),
  });
};

export const mountFeature = async ({ feature, input, root, scope = globalThis, transport }) => {
  invariant(root?.replaceChildren, 'root is required');
  invariant(
    transport?.schema === 'ui-data-transport/1'
      && transport.fragment === 'data'
      && typeof transport.read === 'function'
      && typeof transport.replace === 'function',
    '#data transport is required',
  );
  const pattern = patterns[feature?.id];
  invariant(pattern, `unsupported feature ${String(feature?.id)}`);
  const initialView = feature?.view ?? defaultViewForPattern(pattern);
  invariant(initialView?.pattern === pattern, `view pattern must be ${pattern}`);

  const envelope = await bootstrapEnvelope({ input, view: initialView, scope });
  invariant(envelope.view.pattern === pattern, `Envelope view pattern must be ${pattern}`);
  const moduleResolver = new ModuleResolver({ resolveSource: transport.read });
  const validateRecords = async (records, context) => {
    const { domain } = stateParts(records);
    const modules = await moduleResolver.resolve(domain, context);
    const scenes = validateSceneGraph(domain, modules, context.view);
    return Object.freeze({ modules, scenes });
  };
  const runtime = await DecisionRuntime.create(envelope, { validateRecords });

  const initial = stateParts(runtime.records);
  const initialModules = await moduleResolver.resolve(initial.domain, {
    mapId: runtime.mapId,
    head: runtime.head,
    view: runtime.view,
  });
  const store = new SemanticDomainStore(initial.domain, initial.layoutRecords, initial.dataPinRecords);
  runtime.attachStore(store);

  const surface = await mountSemanticMapSurface({
    featureId: feature.id,
    mode: 'authoring',
    pattern,
    root,
    scope,
    store,
    view: runtime.view,
    modules: initialModules,
  });
  const { adapter, canvas } = surface;
  mountDataPinControls({ adapter, document: root.ownerDocument, mount: canvas.parentElement, store });

  adapter.setOperationHandler(operation => {
    const authored = graphAuthoringOperation(operation, surface.scene());
    const textChanged = authored.type === 'RenameRegion'
      && store.domain.regions.get(authored.regionId)?.label !== authored.label;
    const prepared = [
      runtime.prepareLocalOperation(authored),
      ...(textChanged ? [runtime.prepareLocalOperation({
        type: 'PinData',
        items: [{
          targetId: authored.regionId,
          basis: 'given',
          reason: 'manually edited text',
        }],
      })] : []),
    ];
    const configKey = patternConfigKey(runtime.view.pattern);
    const batch = store.performBatch(prepared, candidate => validatePatternDomain(
      candidate.domain,
      runtime.view.pattern,
      configKey === null ? null : runtime.view[configKey],
    ));
    return batch.results[0];
  });
  adapter.setActivationHandler(async activation => {
    invariant(activation?.kind === 'set-view', `unsupported activation ${String(activation?.kind)}`);
    const nextView = activation.view;
    invariant(nextView?.pattern === pattern, `activation view pattern must be ${pattern}`);
    const configKey = patternConfigKey(nextView.pattern);
    validatePatternDomain(store.domain, nextView.pattern, configKey === null ? null : nextView[configKey]);
    const previous = surface.view;
    const rendered = surface.setView(nextView);
    try {
      await runtime.changeView(nextView);
      await transport.replace(await runtime.envelope());
      return rendered;
    } catch (error) {
      surface.setView(previous);
      throw error;
    }
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
      layout: store.layoutSnapshot(),
      dataPins: store.dataPinSnapshot(),
      draft: store.draftSnapshot(),
      scene: surface.scene() ? Object.freeze({ pattern: surface.scene().pattern }) : null,
      selection: adapter.selectionSnapshot(),
    }),
  });
  const app = Object.freeze({ ready: true, adapter, store, projectDomain: surface.projectDomain });
  scope.semanticMapRuntime = runtime;
  scope.semanticMapModuleResolver = moduleResolver;
  scope.semanticMapApp = app;
  scope.semanticMapDataTransport = transport;
  scope.semanticMapSite = Object.freeze({ ready: true, error: null, editor, runtime });

  let moduleRevision = 0;
  store.onChange(() => {
    const revision = ++moduleRevision;
    queueMicrotask(async () => {
      try {
        const modules = await moduleResolver.resolve(store.domain, {
          mapId: runtime.mapId,
          head: runtime.head,
          view: runtime.view,
        });
        if (revision === moduleRevision) surface.setModules(modules);
      } catch (error) {
        console.error(error);
      }
    });
  });

  scope.document.addEventListener('keydown', event => {
    const target = event.target;
    const textInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
    if (textInput || event.altKey) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) editor.redo(); else editor.undo();
      return;
    }
    if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); editor.redo(); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); editor.deleteSelection(); }
  });

  await Promise.all([import('./authoring/handoff.js'), import('./authoring/review.js')]);
  await Promise.all([waitFor('semanticMapHandoff'), waitFor('semanticMapReview')]);
  const handoffButton = scope.document.getElementById('handoff-fab');
  invariant(handoffButton, 'canonical handoff control is missing');
  handoffButton.disabled = false;
  scope.document.documentElement.dataset.semanticHandoff = 'ready';

  const svg = Boolean(canvas.querySelector('svg'));
  invariant(svg, 'rendered SVG is missing');
  const activeList = adapter.activeList?.snapshot?.() ?? null;
  invariant(activeList?.visible === true && activeList.items.length > 0, 'shared authoring active-list is not hydrated');
  const scene = surface.scene();
  return Object.freeze({
    schema: 'semantic-map-feature-receipt/1',
    feature: feature.id,
    pattern: scene.pattern,
    records: runtime.records.length,
    svg,
    authoring: true,
    handoff: 'semantic-map-handoff/3',
    activeItems: activeList.items.length,
  });
};
