import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegistry } from '../scripts/build-registry.mjs';
import { createEnvelopeInputBridge, lockDetachedAuthoring } from '../../../packages/semantic-map/authoring/artifact-module.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const currentRegistry = await fs.readFile(path.join(ROOT, 'apps/artifact-shell/generated/capability-registry.mjs'), 'utf8');
const expectedRegistry = await buildRegistry({ root: ROOT, check: false, write: false });
assert.equal(currentRegistry, expectedRegistry);

const capability = (await import('../generated/capability-registry.mjs')).CAPABILITY_REGISTRY.capabilities['render-semantic-map'];
assert(capability);
assert.equal(capability.route, '/v1/capabilities/render-semantic-map');
assert.equal(capability.requestSchema, 'artifact-invocation/2');
assert.equal(capability.responseSchema, 'artifact-result/2');
assert.equal(capability.runtime, 'local-runtime/1');

const bridgeInitial = {
  schema: 'semantic-map-envelope/3',
  log: '{"type":"Decision","id":"d1","parent":"genesis","stateHash":"sha256:state","operations":[],"reason":"seed","sourceRefs":[],"timestamp":"2026-09-01T00:00:00Z"}\n',
  proposal: null,
  view: { pattern: 'graph/1' },
};
let bridgeListener = null;
const replaced = [];
const bridge = createEnvelopeInputBridge({
  initialEnvelope: bridgeInitial,
  inputAction: {
    enabled: true,
    inputId: 'map',
    async replace(value) { replaced.push(structuredClone(value)); },
  },
  site: {
    editor: { showError: assert.fail },
    runtime: {
      proposal: null,
      view: bridgeInitial.view,
      envelope: async () => bridgeInitial,
      onChange(listener) { bridgeListener = listener; return () => { bridgeListener = null; }; },
    },
  },
});
assert.equal(typeof bridgeListener, 'function');
assert.deepEqual(bridge.snapshot(), {
  schema: 'semantic-map-artifact-input-bridge/1',
  attached: true,
  inputId: 'map',
  replaceEnabled: true,
  revisions: 0,
  lastError: null,
});
await bridgeListener({ kind: 'view' });
await new Promise(resolve => setImmediate(resolve));
assert.equal(replaced.length, 1);
assert.deepEqual(replaced[0], bridgeInitial);
assert.equal(bridge.snapshot().revisions, 1);
bridge.unsubscribe();
assert.equal(bridgeListener, null);

let failedBridgeListener = null;
const failedBridgeErrors = [];
const failedBridgeValue = structuredClone(bridgeInitial);
failedBridgeValue.view = { ...failedBridgeValue.view, frame: { focus: 'decision', scale: 1.1 } };
const failedBridge = createEnvelopeInputBridge({
  initialEnvelope: bridgeInitial,
  inputAction: {
    enabled: true,
    inputId: 'map',
    async replace() { throw new Error('stale parent input'); },
  },
  site: {
    editor: { showError: message => failedBridgeErrors.push(message) },
    runtime: {
      proposal: failedBridgeValue.proposal,
      view: failedBridgeValue.view,
      envelope: async () => failedBridgeValue,
      onChange(listener) { failedBridgeListener = listener; return () => { failedBridgeListener = null; }; },
    },
  },
});
await assert.rejects(() => failedBridgeListener({ kind: 'view' }), /stale parent input/);
await new Promise(resolve => setImmediate(resolve));
assert.equal(failedBridge.snapshot().revisions, 0);
assert.equal(failedBridge.snapshot().lastError, 'stale parent input');
assert.deepEqual(failedBridgeErrors, ['共有入力を更新できません: stale parent input']);
failedBridge.unsubscribe();
assert.equal(failedBridgeListener, null);

const readOnlyControls = [{ disabled: false }, { disabled: false }, { disabled: false }];
const readOnlyHandlers = {};
const readOnlyRuntime = {
  accept() {},
  changeView() {},
  commitView() {},
  reject() {},
};
const readOnly = lockDetachedAuthoring({
  contentDocument: { querySelectorAll: selector => {
    assert.equal(selector, '[data-state-control], #review-accept, #review-reject');
    return readOnlyControls;
  } },
}, {
  editor: { adapter: {
    setOperationHandler(handler) { readOnlyHandlers.operation = handler; },
    setActivationHandler(handler) { readOnlyHandlers.activation = handler; },
  } },
  runtime: readOnlyRuntime,
});
assert(readOnlyControls.every(item => item.disabled));
assert.throws(() => readOnlyHandlers.operation({ type: 'MoveRegion' }), /read-only/);
await assert.rejects(() => readOnlyHandlers.activation({ kind: 'set-view' }), /read-only/);
assert.throws(() => readOnlyRuntime.accept(), /read-only/);
assert.throws(() => readOnlyRuntime.changeView(), /read-only/);
assert.throws(() => readOnlyRuntime.commitView(), /read-only/);
assert.throws(() => readOnlyRuntime.reject(), /read-only/);
assert.deepEqual(readOnly.snapshot(), { schema: 'semantic-map-detached-authoring-lock/1', locked: true });

console.log(JSON.stringify({ schema: 'semantic-map-capability-test/1', status: 'PASS' }));
