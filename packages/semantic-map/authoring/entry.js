import { createSemanticMap, parseSemanticMapRecords } from '../domain/index.js';
import { createDecisionLog, createEnvelope, defaultViewForPattern, inspectEnvelope, normalizeView } from '../protocol/index.js';
import { ModuleResolver } from '../module-embedding/index.js';
import { compileTwoSetTopologyPresentation, validateSceneGraph } from '../projection/index.js';
import { DecisionRuntime } from './runtime.js';
import { nextFrame, readJson } from './shared.js';
import { createSemanticMapArtifactModuleBridge } from './artifact-module.js';
import { translateSetTopologyOperation } from './set-topology-bridge.js';

const EMBED_INPUT_SCHEMA = 'semantic-map-embed-input/1';
const PARENT_MESSAGE_INPUT = 'parent-message';
const pageConfig = readJson('semantic-page-config');
const artifactModuleBridge = createSemanticMapArtifactModuleBridge({ window: globalThis, embedded: pageConfig.mode === 'embedded' });
if (artifactModuleBridge.embedded) document.documentElement.dataset.artifactModule = 'true';
globalThis.semanticMapArtifactModule = artifactModuleBridge;

const routeState = document.getElementById('route-state');
const routeTitle = document.getElementById('route-state-title');
const routeMessage = document.getElementById('route-state-message');
const mapTitle = document.getElementById('map-title');
const patternSelect = document.getElementById('pattern-select');
const seqPreset = document.getElementById('seq-preset');
const seqPresetWrap = document.getElementById('seq-preset-wrap');

function setRouteState(title, message) { routeTitle.textContent = title; routeMessage.textContent = message; routeState.hidden = false; }
function enableEditorControls() { for (const element of document.querySelectorAll('[data-state-control]')) element.disabled = false; }
async function applyView(editor, view) {
  const frame = view?.frame;
  if (!frame) return;
  if (frame.bbox && frame.viewport) {
    editor.focusBounds({ x: frame.bbox[0], y: frame.bbox[1], width: frame.bbox[2], height: frame.bbox[3] }, { width: frame.viewport[0], height: frame.viewport[1] });
    await nextFrame(2);
  } else if (frame.focus && frame.scale) {
    if (editor.focusRegion(frame.focus, frame.scale)) await nextFrame(2);
  }
  if (frame.select?.length) { editor.adapter.setSelection({ regionIds: [...frame.select], relationIds: [] }); await nextFrame(1); }
}

function embeddedEnvelope(timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      globalThis.removeEventListener('message', onMessage);
      reject(new Error('embedded Envelope input timed out'));
    }, timeoutMs);
    async function onMessage(event) {
      if (event.source !== globalThis.parent) return;
      if (event.origin !== globalThis.location.origin) return;
      if (event.data?.schema !== EMBED_INPUT_SCHEMA) return;
      clearTimeout(timer);
      globalThis.removeEventListener('message', onMessage);
      try {
        const inspection = await inspectEnvelope(event.data.envelope);
        resolve(inspection.envelope);
      } catch (error) {
        reject(error);
      }
    }
    globalThis.addEventListener('message', onMessage);
  });
}

async function bootstrapEnvelope(config) {
  if (config.input === PARENT_MESSAGE_INPUT) return embeddedEnvelope();
  const initialText = document.getElementById('semantic-initial-state')?.textContent ?? '';
  const initialRecords = parseSemanticMapRecords(initialText);
  const mapId = config.mapId || `urn:uuid:${crypto.randomUUID()}`;
  const log = await createDecisionLog(initialRecords, mapId);
  return createEnvelope(log.log, null, normalizeView(config.view));
}
function presetFromView(view) { return view.pattern !== 'seq/1' ? 'actor:ordinal' : `${view.seq.groupBy}:${view.seq.axis}`; }
function viewFromControls(currentView) {
  const pattern = patternSelect.value;
  const composition = currentView.resourceComposition ? { resourceComposition: currentView.resourceComposition } : {};
  const view = { ...defaultViewForPattern(pattern), ...composition };
  if (pattern === 'seq/1') { const [groupBy, axis] = seqPreset.value.split(':'); view.seq = { groupBy, axis }; }
  return view;
}
function syncPatternControls(view) { patternSelect.value = view.pattern; seqPreset.value = presetFromView(view); seqPresetWrap.hidden = view.pattern !== 'seq/1'; }
async function commitViewChange(runtime, editor, view) {
  const previous = runtime.view;
  try {
    const preflight = await runtime.preflightView(view);
    const modules = preflight.validation?.modules ?? null;
    await editor.setView(preflight.view, modules);
    const committed = runtime.commitView(preflight);
    syncPatternControls(runtime.view);
    return committed;
  } catch (error) {
    syncPatternControls(previous);
    try {
      const modules = await globalThis.semanticMapModuleResolver.resolve(editor.store.domain, { mapId: runtime.mapId, head: runtime.head, view: previous });
      await editor.setView(previous, modules);
    } catch (_) { /* best effort rollback */ }
    throw error;
  }
}
function installPatternControls(runtime, editor) {
  let changing = false;
  syncPatternControls(runtime.view);
  const changePattern = async (view = viewFromControls(runtime.view)) => {
    if (changing) return null;
    changing = true; patternSelect.disabled = true; seqPreset.disabled = true;
    try { return await commitViewChange(runtime, editor, view); }
    finally { changing = false; patternSelect.disabled = false; seqPreset.disabled = false; }
  };
  patternSelect.addEventListener('change', () => { seqPresetWrap.hidden = patternSelect.value !== 'seq/1'; void changePattern().catch(error => { console.error(error); editor.notify(error.message, true); }); });
  seqPreset.addEventListener('change', () => { void changePattern().catch(error => { console.error(error); editor.notify(error.message, true); }); });
  return changePattern;
}

async function start() {
  const config = pageConfig;
  setRouteState('Loading', String(config.title ?? 'Semantic Map'));
  const envelope = await bootstrapEnvelope(config);
  const moduleResolver = new ModuleResolver();
  const validateRecords = async (records, context) => {
    const domain = createSemanticMap(records);
    const modules = await moduleResolver.resolve(domain, context);
    const scenes = validateSceneGraph(domain, modules, context.view);
    return Object.freeze({ modules, scenes });
  };
  const runtime = await DecisionRuntime.create(envelope, { validateRecords });
  globalThis.semanticMapRuntime = runtime;
  globalThis.semanticMapModuleResolver = moduleResolver;

  const meta = runtime.records.find(record => record.type === 'meta');
  mapTitle.textContent = String(meta?.title ?? config.title ?? 'Untitled');
  document.title = `${mapTitle.textContent} — Semantic Map`;
  routeMessage.textContent = mapTitle.textContent;

  const { createSemanticMapEditor } = await import('./main.js');
  const initialDomain = createSemanticMap(runtime.records);
  const initialModules = await moduleResolver.resolve(initialDomain, { mapId: runtime.mapId, head: runtime.head, view: runtime.view });
  validateSceneGraph(initialDomain, initialModules, runtime.view);
  const setTopologyProof = config.setTopologyProof === true;
  const setTopologyProjectionProfile = config.setTopologyProjectionProfile ?? 'horizontal';
  const editor = await createSemanticMapEditor(initialDomain, {
    view: runtime.view,
    prepareOperation: operation => runtime.prepareLocalOperation(operation),
    projectPresentation: setTopologyProof ? domain => compileTwoSetTopologyPresentation(domain, { profile: setTopologyProjectionProfile }) : undefined,
    translateOperation: setTopologyProof ? translateSetTopologyOperation : undefined,
    moduleResolver,
    moduleContext: () => ({ mapId: runtime.mapId, head: runtime.head }),
    initialModules,
    readOnly: artifactModuleBridge.embedded,
  });
  runtime.attachStore(editor.store);
  artifactModuleBridge.attach(editor);
  if (!artifactModuleBridge.embedded) {
    editor.adapter.setActivationHandler(async activation => {
      if (activation?.kind !== 'set-view') throw new Error(`unsupported activation: ${activation?.kind ?? '<missing>'}`);
      await commitViewChange(runtime, editor, activation.view);
    });
  }
  await applyView(editor, runtime.view);
  const changePattern = artifactModuleBridge.embedded ? null : installPatternControls(runtime, editor);
  if (!artifactModuleBridge.embedded) {
    enableEditorControls(); syncPatternControls(runtime.view);
    await Promise.all([import('./handoff.js'), import('./review.js'), import('./source.js')]);
  }
  routeState.hidden = true;
  return Object.freeze({
    ready: true, route: 'app', mode: String(config.mode ?? 'new'), setTopologyProof, setTopologyProjectionProfile,
    editor, runtime, artifactModule: artifactModuleBridge.read(), changePattern,
  });
}

start().then(site => { globalThis.semanticMapSite = site; }).catch(error => {
  console.error(error); setRouteState('Failed to open', error.message); globalThis.semanticMapSite = Object.freeze({ ready: false, error: error.message });
});