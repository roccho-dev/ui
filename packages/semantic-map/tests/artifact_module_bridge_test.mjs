import assert from 'node:assert/strict';
import {
  SEMANTIC_MAP_MODULE_IDENTITY,
  createSemanticMapArtifactModuleBridge,
  normalizeSemanticMapModuleState,
} from '../authoring/artifact-module.js';

const listeners = new Map();
const parent = {};
const window = {
  parent,
  addEventListener(name, listener) { listeners.set(name, listener); },
  removeEventListener(name, listener) { if (listeners.get(name) === listener) listeners.delete(name); },
};
const outgoing = [];
const port = {
  onmessage: null,
  postMessage(value) { outgoing.push(value); },
  start() {},
  close() {},
};
const bridge = createSemanticMapArtifactModuleBridge({ window });
assert.equal(bridge.embedded, true);
assert.deepEqual(normalizeSemanticMapModuleState({ schema: 'semantic-map-module-state/1', mode: 'overview' }), {
  schema: 'semantic-map-module-state/1', mode: 'overview',
});
assert.deepEqual(normalizeSemanticMapModuleState({ schema: 'semantic-map-module-state/1', mode: 'overview', focusRef: 'detail-a' }), { schema: 'semantic-map-module-state/1', mode: 'overview', focusRef: 'detail-a' });
assert.throws(() => normalizeSemanticMapModuleState({ schema: 'semantic-map-module-state/1', mode: 'focus' }), /focusRef/u);
listeners.get('message')({
  data: { ...SEMANTIC_MAP_MODULE_IDENTITY, protocol: 'artifact-module-lifecycle/1', schema: 'artifact-module-init/1' },
  ports: [port],
});
assert.equal(outgoing.at(-1).schema, 'artifact-module-ready/1');
port.onmessage({ data: { schema: 'artifact-module-state/1', sequence: 1, value: { schema: 'semantic-map-module-state/1', mode: 'focus', focusRef: 'detail-a' } } });
assert.equal(bridge.read().metrics.pendingCount, 1);

const records = [
  { type: 'meta', schema: 'semantic-map/1', root: 'presentation', title: 'Presentation' },
  { type: 'region', id: 'presentation', parent: null, label: 'Presentation', kind: 'root', summary: '', bounds: [0, 0, 100, 100] },
  { type: 'region', id: 'track', parent: 'presentation', label: 'Track', kind: 'actor', summary: '', bounds: [0, 0, 10, 10] },
  { type: 'region', id: 'detail-a', parent: 'presentation', label: 'A', kind: 'task', summary: '', bounds: [0, 0, 10, 10], temporal: { ordinal: { start: 1, end: 1 } } },
  { type: 'region', id: 'detail-b', parent: 'presentation', label: 'B', kind: 'task', summary: '', bounds: [0, 0, 10, 10], temporal: { ordinal: { start: 2, end: 2 } } },
];
let selection = { regionIds: [], relationIds: [] };
let resetCount = 0;
let focused = null;
const coreListeners = new Set();
const snapshot = () => Object.freeze({
  document: Object.freeze({ root: 'presentation' }),
  records: structuredClone(records),
  selection: Object.freeze({
    regionIds: Object.freeze([...selection.regionIds]),
    relationIds: Object.freeze([...selection.relationIds]),
  }),
});
const core = {
  snapshot,
  dispatch(command) {
    assert.equal(command.type, 'selection.set');
    selection = {
      regionIds: [...command.selection.regionIds],
      relationIds: [...command.selection.relationIds],
    };
    const event = Object.freeze({ kind: 'selection', core: snapshot() });
    for (const listener of [...coreListeners]) listener(event);
    return snapshot().selection;
  },
  subscribe(listener) { coreListeners.add(listener); return () => coreListeners.delete(listener); },
};
const editor = {
  core,
  focusRegion(id) { focused = id; return true; },
  fitOverview() { resetCount += 1; },
  reset() { resetCount += 1; },
  snapshot() { return { scene: { pattern: 'seq/1' } }; },
};
bridge.attach(editor);
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(outgoing.at(-1).schema, 'artifact-module-state-applied/1');
assert.equal(outgoing.at(-1).status, 'PASS');
assert.equal(outgoing.at(-1).value.focusRef, 'detail-a');
assert.equal(focused, 'detail-a');
assert.equal(outgoing.at(-1).value.markerRef, 'detail-a');
assert.deepEqual(selection.regionIds, ['detail-a']);
assert.equal(outgoing.filter(item => item.schema === 'artifact-module-event/1').length, 0, 'parent-driven focus must not emit activation');

port.onmessage({ data: { schema: 'artifact-module-state/1', sequence: 2, value: { schema: 'semantic-map-module-state/1', mode: 'overview', focusRef: 'detail-b' } } });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(outgoing.at(-1).status, 'PASS');
assert.equal(resetCount, 1);
assert.deepEqual(selection.regionIds, []);
assert.equal(outgoing.at(-1).value.markerRef, 'detail-b');

port.onmessage({ data: { schema: 'artifact-module-state/1', sequence: 3, value: { schema: 'semantic-map-module-state/1', mode: 'focus', focusRef: 'missing' } } });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(outgoing.at(-1).status, 'FAIL');
assert.match(outgoing.at(-1).error, /focusRef is missing/u);

core.dispatch({ type: 'selection.set', selection: { regionIds: ['track'], relationIds: [] } });
assert.notEqual(outgoing.at(-1).schema, 'artifact-module-event/1', 'actor selection must not activate a slide');
core.dispatch({ type: 'selection.set', selection: { regionIds: ['detail-b'], relationIds: [] } });
assert.equal(outgoing.at(-1).schema, 'artifact-module-event/1');
assert.equal(outgoing.at(-1).event, 'activate');
assert.equal(outgoing.at(-1).value.ref, 'detail-b');
assert.equal(bridge.read().metrics.initCount, 1);
assert.equal(bridge.read().metrics.applyCount, 2);
assert.equal(bridge.read().metrics.eventCount, 1);
bridge.dispose();
assert.equal(listeners.has('message'), false);
assert.equal(coreListeners.size, 0);

console.log(JSON.stringify({
  schema: 'semantic-map-artifact-module-bridge-test/1',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  assertions: 33,
  identity: SEMANTIC_MAP_MODULE_IDENTITY,
  queuedBeforeEditor: true,
  parentFocusSuppressed: true,
  coreOwnedSelection: true,
  adapterBypassAbsent: true,
  actorActivationSuppressed: true,
  userActivationEmitted: true,
  failClosedMissingFocus: true,
}));
