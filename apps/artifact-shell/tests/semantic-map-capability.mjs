import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createArtifactInvocationRuntime } from '../../../packages/artifact-invocation/src/index.mjs';
import { inspectEnvelope } from '../../../packages/semantic-map/protocol/index.js';
import { createEnvelopeInputBridge, lockDetachedAuthoring } from '../../../packages/semantic-map/runtime.js';
import { buildRegistry } from '../scripts/build-registry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const capabilityRoot = path.join(appRoot, 'capabilities', 'render-semantic-map');
const registryOutput = path.join(appRoot, 'generated', 'capability-registry.mjs');
const registry = await buildRegistry({ capabilitiesRoot: path.join(appRoot, 'capabilities'), check: true, output: registryOutput });
const manifest = registry.manifests.find(item => item.id === 'render.semantic-map');
assert.ok(manifest, 'render.semantic-map manifest is missing');
assert.deepEqual(manifest.requires.services, ['ui.package.execute']);

let serviceCalls = 0;
const runtime = await createArtifactInvocationRuntime({
  engineBaseUrl: pathToFileURL(registryOutput).href,
  environment: { runtime: 'browser', features: ['crypto.subtle', 'dom', 'fetch'] },
  fetchEngine: async href => new Response(await fs.readFile(fileURLToPath(new URL(href))), { headers: { 'content-type': 'text/javascript' } }),
  manifests: registry.manifests,
  runtimeBuild: { digest: registry.runtimeBuild.digest, id: registry.runtimeBuild.id, version: registry.runtimeBuild.version },
  services: {
    'ui.package.execute': async ({ packageId, input }) => {
      assert.equal(packageId, 'semantic-map');
      const inspected = await inspectEnvelope(input.envelope);
      serviceCalls += 1;
      return Object.freeze({
        schema: 'semantic-map-render-receipt/1',
        mapId: inspected.base.mapId,
        head: inspected.base.head,
        stateHash: inspected.base.stateHash,
        pattern: inspected.envelope.view.pattern,
        proposal: Boolean(inspected.envelope.proposal),
        editorReady: true,
        source: Object.freeze({ contract: 'semantic-map-envelope/3', mode: 'test-service' }),
      });
    },
  },
});

const files = [...manifest.fixtures.pass.map(file => ['pass', file]), ...manifest.fixtures.destructive.map(file => ['destructive', file])];
const outcomes = [];
for (const [kind, relative] of files) {
  const fixture = JSON.parse(await fs.readFile(path.join(capabilityRoot, relative), 'utf8'));
  const outcome = await runtime.execute({ request: fixture.request });
  if (outcome.result.status !== fixture.expected.status) console.error(JSON.stringify({fixture:fixture.id,result:outcome.result,manifest:outcome.manifest}, null, 2));
  assert.equal(outcome.result.status, fixture.expected.status, fixture.id);
  assert.deepEqual(outcome.result.outputs.map(item => item.contract), fixture.expected.outputContracts, fixture.id);
  if (kind === 'pass') {
    assert.equal(outcome.manifest.id, 'render.semantic-map');
    assert.equal(outcome.result.outputs[0].value.schema, 'semantic-map-render-receipt/1');
  }
  outcomes.push(Object.freeze({ id: fixture.id, kind, status: outcome.result.status }));
}
assert.equal(serviceCalls, manifest.fixtures.pass.length);
assert.deepEqual(runtime.loadedCapabilities(), ['render.semantic-map@1']);

const bridgeFixture = JSON.parse(await fs.readFile(path.join(capabilityRoot, 'fixtures/graph.pass.json'), 'utf8'));
const bridgeInitial = bridgeFixture.request.inputs[0].source.value;
let bridgeValue = bridgeInitial;
let bridgeListener = null;
const bridgeActions = [];
const bridgeErrors = [];
const bridgeSite = {
  editor: { showError: message => bridgeErrors.push(message) },
  runtime: {
    proposal: bridgeInitial.proposal,
    view: bridgeInitial.view,
    envelope: async () => bridgeValue,
    onChange(listener) { bridgeListener = listener; return () => { bridgeListener = null; }; },
  },
};
const bridge = createEnvelopeInputBridge({
  initialEnvelope: bridgeInitial,
  inputAction: {
    enabled: true,
    inputId: 'map',
    async replace(action) { bridgeActions.push(structuredClone(action)); return Object.freeze({ schema: 'artifact-shell-action-commit/1' }); },
  },
  site: bridgeSite,
});
assert.equal(bridge.snapshot().revisions, 0);
bridgeValue = structuredClone(bridgeInitial);
bridgeValue.view = { ...bridgeValue.view, frame: { focus: 'request', scale: 1 } };
bridgeSite.runtime.view = bridgeValue.view;
await bridgeListener({ kind: 'view' });
assert.equal(bridgeActions.length, 1);
assert.deepEqual(bridgeActions[0].expectedValue, bridgeInitial);
assert.deepEqual(bridgeActions[0].value, bridgeValue);
assert.equal(bridgeActions[0].history, 'replace');
assert.equal(bridge.snapshot().revisions, 1);
await bridgeListener({ kind: 'view' });
assert.equal(bridgeActions.length, 1);
assert.deepEqual(bridgeErrors, []);
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
assert.deepEqual(failedBridgeErrors, ['共有URLを更新できません: stale parent input']);
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
    setActivationHandler(handler) { readOnlyHandlers.activation = handler; },
    setOperationHandler(handler) { readOnlyHandlers.operation = handler; },
  } },
  runtime: readOnlyRuntime,
});
assert.deepEqual(readOnly, { enabled: true, reason: 'host-input-immutable', schema: 'semantic-map-read-only-lock/1' });
assert.ok(readOnlyControls.every(control => control.disabled));
for (const blocked of [readOnlyHandlers.activation, readOnlyHandlers.operation, readOnlyRuntime.accept, readOnlyRuntime.changeView, readOnlyRuntime.commitView, readOnlyRuntime.reject]) {
  assert.throws(() => blocked(), /input is read-only/);
}

console.log(JSON.stringify({ schema: 'semantic-map-capability-integration/1', status: 'PASS', fixtures: outcomes.length, serviceCalls, inputBridgeActions: bridgeActions.length, outcomes }));
