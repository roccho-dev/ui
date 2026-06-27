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

function rootComponent(records) {
  return records.find((item) => item.updateComponents)?.updateComponents?.components
    .find((component) => component.id === 'root');
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

test('latest source UI is declared as one allowlisted A2UI root component', async () => {
  const records = await messages();
  const create = records.find((item) => item.createSurface)?.createSurface;
  const update = records.find((item) => item.updateComponents)?.updateComponents;
  assert.equal(create.surfaceId, 'purpose-atlas');
  assert.equal(create.sendDataModel, true);
  assert.match(create.catalogId, /purpose-atlas\/v6-source-ui$/);
  assert.deepEqual(update.components.map((item) => item.id), ['root']);
  assert.equal(update.components[0].component, 'AtlasSourceSurface');
});

test('all 15 user operations are named A2UI actions with bound context', async () => {
  const records = await messages();
  const root = rootComponent(records);
  const actions = Object.values(root)
    .filter((value) => value?.event?.name)
    .map((value) => value.event.name);
  assert.deepEqual(new Set(actions), new Set([
    'atlas.reset', 'atlas.previous', 'atlas.next', 'atlas.togglePlay',
    'atlas.stepChanged', 'atlas.modeChanged', 'atlas.fit', 'atlas.zoomIn', 'atlas.zoomOut',
    'atlas.select', 'atlas.recordMismatch', 'atlas.requestOwner', 'atlas.holdDecision',
    'atlas.stepForward', 'atlas.clearSelection',
  ]));
  assert.deepEqual(root.onStepChanged.event.context.step, {path: '/ui/step'});
  assert.deepEqual(root.onModeChanged.event.context.mode, {path: '/ui/viewMode'});
  assert.deepEqual(root.onSelect.event.context.selection, {path: '/ui/selection'});
});

test('JSON contains no executable payloads', async () => {
  const text = await readFile(surfacePath, 'utf8');
  assert.equal(text.includes('functionCall'), false);
  assert.equal(text.includes('javascript:'), false);
  assert.equal(text.includes('<script'), false);
});

test('unknown action names are rejected', async () => {
  const records = clone(await messages());
  rootComponent(records).onNext.event.name = 'evil.execute';
  assert.throws(() => validateAtlasMessages(records), /not allowlisted/);
});

test('relative and out-of-scope DataModel paths are rejected', async () => {
  const relative = clone(await messages());
  rootComponent(relative).step.path = 'ui/step';
  assert.throws(() => validateAtlasMessages(relative), /absolute JSON Pointer/);

  const outOfScope = clone(await messages());
  rootComponent(outOfScope).snapshot.path = '/secrets/token';
  assert.throws(() => validateAtlasMessages(outOfScope), /outside Atlas DataModel/);
});

test('undeclared component properties are rejected by strict catalog schemas', async () => {
  const records = clone(await messages());
  rootComponent(records).execute = {functionCall: 'alert'};
  assert.throws(() => validateAtlasMessages(records), /property error/);
});
