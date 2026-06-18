import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {A2uiMessageSchema} from '@a2ui/web_core/v0_9';
import {validateAtlasMessages} from '../src/a2ui/validate-messages.js';

const surfacePath = new URL('../public/a2ui/purpose-atlas.surface.jsonl', import.meta.url);

async function messages() {
  const text = await readFile(surfacePath, 'utf8');
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(JSON.parse);
}

function clone(value) {
  return structuredClone(value);
}

test('every JSONL record conforms to A2UI v0.9 message schema', async () => {
  const records = await messages();
  assert.equal(records.length, 3);
  records.forEach((record) => assert.doesNotThrow(() => A2uiMessageSchema.parse(record)));
});

test('surface passes the strict Atlas catalog and security validator', async () => {
  const records = await messages();
  assert.equal(validateAtlasMessages(records), records);
});

test('surface is fully declared in A2UI JSON', async () => {
  const records = await messages();
  const create = records.find((item) => item.createSurface)?.createSurface;
  const update = records.find((item) => item.updateComponents)?.updateComponents;
  assert.equal(create.surfaceId, 'purpose-atlas');
  assert.equal(create.sendDataModel, true);
  assert.match(create.catalogId, /purpose-atlas\/v6$/);
  assert.deepEqual(update.components.map((item) => item.id), [
    'root', 'atlas-header', 'atlas-toolbar', 'atlas-canvas', 'atlas-inspector', 'atlas-toast',
  ]);
});

test('all user operations are named A2UI actions with bound context', async () => {
  const records = await messages();
  const components = records.find((item) => item.updateComponents).updateComponents.components;
  const actions = [];
  for (const component of components) {
    for (const value of Object.values(component)) {
      if (value?.event?.name) actions.push(value.event.name);
    }
  }
  assert.deepEqual(new Set(actions), new Set([
    'atlas.reset', 'atlas.previous', 'atlas.next', 'atlas.togglePlay',
    'atlas.stepChanged', 'atlas.modeChanged', 'atlas.fit', 'atlas.zoomIn', 'atlas.zoomOut',
    'atlas.select', 'atlas.recordMismatch', 'atlas.requestOwner', 'atlas.holdDecision',
    'atlas.stepForward', 'atlas.clearSelection',
  ]));
  const toolbar = components.find((item) => item.id === 'atlas-toolbar');
  assert.deepEqual(toolbar.onStepChanged.event.context.step, {path: '/ui/step'});
  assert.deepEqual(toolbar.onModeChanged.event.context.mode, {path: '/ui/viewMode'});
});

test('JSON contains no executable payloads', async () => {
  const text = await readFile(surfacePath, 'utf8');
  assert.equal(text.includes('functionCall'), false);
  assert.equal(text.includes('javascript:'), false);
  assert.equal(text.includes('<script'), false);
});

test('unknown action names are rejected', async () => {
  const records = clone(await messages());
  const toolbar = records.find((item) => item.updateComponents).updateComponents.components
    .find((item) => item.id === 'atlas-toolbar');
  toolbar.onNext.event.name = 'evil.execute';
  assert.throws(() => validateAtlasMessages(records), /not allowlisted/);
});

test('relative and out-of-scope DataModel paths are rejected', async () => {
  const relative = clone(await messages());
  const toolbar = relative.find((item) => item.updateComponents).updateComponents.components
    .find((item) => item.id === 'atlas-toolbar');
  toolbar.step.path = 'ui/step';
  assert.throws(() => validateAtlasMessages(relative), /absolute JSON Pointer/);

  const outOfScope = clone(await messages());
  const header = outOfScope.find((item) => item.updateComponents).updateComponents.components
    .find((item) => item.id === 'atlas-header');
  header.title.path = '/secrets/token';
  assert.throws(() => validateAtlasMessages(outOfScope), /outside Atlas DataModel/);
});

test('undeclared component properties are rejected by strict catalog schemas', async () => {
  const records = clone(await messages());
  const canvas = records.find((item) => item.updateComponents).updateComponents.components
    .find((item) => item.id === 'atlas-canvas');
  canvas.execute = {functionCall: 'alert'};
  assert.throws(() => validateAtlasMessages(records), /property error/);
});
