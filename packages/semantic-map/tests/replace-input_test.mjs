import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSemanticMapEditorCore, createWorkspace } from '../editor-core/index.js';

const records = fs.readFileSync(new URL('../examples/example.jsonl', import.meta.url), 'utf8')
  .trim().split(/\r?\n/u).map(JSON.parse);
const replacement = () => createWorkspace(structuredClone(records).map(record => (
  record.type === 'region' && record.id === 'request'
    ? { ...record, label: 'Replacement document' }
    : record
)), { selection: { regionIds: ['request'], relationIds: [] }, frame: { map: 'm2', time: 't2' } });

function harness() {
  let mode = 'allow';
  let gesture = null;
  const hooks = { authorize: null, reload: null, commit: null };
  const calls = { authorize: [], reload: [], commit: [], render: [], chrome: [], events: [] };
  const core = createSemanticMapEditorCore({
    semantic: records,
    layout: { selection: { regionIds: [], relationIds: [] }, frame: null },
    revision: 'r0',
    ports: {
      surface: {
        render: value => { calls.render.push(structuredClone(value)); },
        onGesture: handler => { gesture = handler; return () => { gesture = null; }; },
        destroy: () => { gesture = null; },
      },
      authority: {
        authorize: value => {
          calls.authorize.push(structuredClone(value));
          hooks.authorize?.(value);
          if (mode === 'authority-throw') throw new Error('E_REPLACE_AUTHORITY_THROW');
          if (mode === 'authority-null') return null;
          if (mode === 'authority-async') return Promise.resolve({ allowed: true });
          return { allowed: mode !== 'deny', code: 'E_REPLACE_DENIED', reason: 'replacement test' };
        },
      },
      document: {
        requestEdit: ({ operation }) => ({ operations: [operation] }),
        reload: value => {
          calls.reload.push(structuredClone(value));
          hooks.reload?.(value);
          if (mode === 'reload-throw') throw new Error('E_REPLACE_RELOAD_THROW');
          if (mode === 'reload-async') return Promise.resolve({ input: value.input });
          if (mode === 'reload-invalid') return { input: { schema: 'invalid-workspace' } };
          return { input: value.input, revision: 'loaded-r1' };
        },
        commit: value => {
          calls.commit.push(structuredClone(value));
          hooks.commit?.(value);
          if (mode === 'commit-throw') throw new Error('E_REPLACE_COMMIT_THROW');
          if (mode === 'commit-stale') throw new Error('E_REPLACE_REVISION_CONFLICT');
          if (mode === 'commit-async') return Promise.resolve({ revision: 'r1' });
          return { revision: value.operations.length === 0 ? 'accepted-r1' : value.expectedRevision };
        },
        renderChrome: value => { calls.chrome.push(structuredClone(value)); },
      },
    },
  });
  core.dispatch({ type: 'AddRegion', parentId: 'map', label: 'Before replacement', kind: 'concept', summary: '', bounds: [40, 610, 150, 72] });
  core.dispatch({ type: 'RenameRegion', regionId: 'request', label: 'First edit' });
  core.dispatch({ type: 'RenameRegion', regionId: 'request', label: 'Redo must survive' });
  core.dispatch({ type: 'history.undo' });
  core.dispatch({ type: 'selection.set', selection: { regionIds: ['region.core-1'], relationIds: [] } });
  core.dispatch({ type: 'frame.set', frame: { map: 'm1', time: 't1' } });
  core.subscribe(event => { calls.events.push(structuredClone(event)); });
  for (const values of Object.values(calls)) values.length = 0;
  return { core, calls, setMode: value => { mode = value; }, onCommit: value => { hooks.commit = value; }, on: (name, value) => { hooks[name] = value; } };
}

const failures = [
  ['deny', /E_REPLACE_DENIED/u, 0, 0],
  ['authority-throw', /E_REPLACE_AUTHORITY_THROW/u, 0, 0],
  ['authority-null', /AuthorityPort.authorize must return a decision/u, 0, 0],
  ['authority-async', /AuthorityPort.authorize must be synchronous/u, 0, 0],
  ['reload-throw', /E_REPLACE_RELOAD_THROW/u, 1, 0],
  ['reload-async', /DocumentPort.reload must be synchronous/u, 1, 0],
  ['reload-invalid', /workspace-codec: schema must be/u, 1, 0],
  ['commit-throw', /E_REPLACE_COMMIT_THROW/u, 1, 1],
  ['commit-stale', /E_REPLACE_REVISION_CONFLICT/u, 1, 1],
  ['commit-async', /DocumentPort.commit must be synchronous/u, 1, 1],
];
for (const [mode, error, reloads, commits] of failures) {
  const test = harness();
  const before = structuredClone(test.core.snapshot());
  test.setMode(mode);
  assert.throws(() => test.core.replaceInput(replacement()), error, `E_REPLACE_INPUT_BOUNDARY: ${mode}`);
  assert.deepEqual(test.core.snapshot(), before, `E_REPLACE_INPUT_ATOMIC: ${mode}`);
  assert.equal(test.calls.authorize.length, 1, mode);
  assert.equal(test.calls.authorize[0].intent.type, 'document.replace', mode);
  assert.equal(test.calls.authorize[0].stateHash, before.stateHash, mode);
  assert.equal(test.calls.reload.length, reloads, mode);
  assert.equal(test.calls.commit.length, commits, mode);
  for (const name of ['render', 'chrome', 'events']) assert.equal(test.calls[name].length, 0, `${mode}: ${name}`);
  assert.ok(Array.isArray(before.records), 'semantic values must be observed through the public snapshot');
  test.setMode('allow');
  assert.equal(test.core.dispatch({ type: 'history.redo' }), true, `${mode}: redo history must survive`);
  assert.equal(test.core.snapshot().records.find(row => row.id === 'request').label, 'Redo must survive', mode);
  assert.equal(test.core.dispatch({ type: 'history.undo' }), true, `${mode}: undo must still work`);
  const created = test.core.dispatch({ type: 'AddRegion', parentId: 'map', label: 'After rejected replacement', kind: 'concept', summary: '', bounds: [220, 610, 150, 72] });
  assert.equal(created.createdRegionId, 'region.core-2', `${mode}: rejected replacement must not change ID allocation`);
  test.core.destroy();
}

const accepted = harness();
const before = structuredClone(accepted.core.snapshot());
const input = replacement();
const inputBefore = structuredClone(input);
accepted.onCommit(() => {
  for (const name of ['render', 'chrome', 'events']) assert.equal(accepted.calls[name].length, 0, `provisional ${name} escaped before commit`);
});
const result = accepted.core.replaceInput(input);
assert.deepEqual(input, inputBefore, 'replacement must not mutate its caller input');
assert.equal(accepted.calls.authorize.length, 1);
assert.equal(accepted.calls.reload.length, 1);
assert.equal(accepted.calls.commit.length, 1);
assert.equal(accepted.calls.commit[0].expectedRevision, before.revision, 'CAS must use the previous committed revision, not the reloaded revision');
assert.equal(accepted.calls.commit[0].stateHash, before.stateHash);
assert.deepEqual(accepted.calls.commit[0].operations, [], 'full replacement is not a fabricated domain operation');
assert.deepEqual(accepted.calls.commit[0].layout, input.layout);
assert.equal(accepted.calls.commit[0].semantic.regions.get('request').label, 'Replacement document');
assert.equal(result.revision, 'accepted-r1');
assert.equal(result.records.find(row => row.id === 'request').label, 'Replacement document');
assert.deepEqual(result.selection, input.layout.selection);
assert.deepEqual(result.frame, input.layout.frame);
assert.equal(result.draft.applied, 0);
assert.equal(result.draft.redo, 0);
assert.equal(result.idSequence, 0);
for (const name of ['render', 'chrome', 'events']) assert.equal(accepted.calls[name].length, 1, `successful replacement: ${name}`);
assert.equal(accepted.calls.events[0].kind, 'replace');
assert.equal(accepted.calls.events[0].authority.allowed, true);
const detached = structuredClone(result.records);
// An independent mutable copy and a deeply frozen value are both safe.
try { result.records.find(row => row.id === 'request').bounds[0] += 100; }
catch (error) { assert.ok(error instanceof TypeError); }
assert.deepEqual(accepted.core.snapshot().records, detached, 'snapshot values must not mutate semantic state');
accepted.core.destroy();

// Public mutation cannot reenter a document replacement from any callback.
// Each attack must reach its intended callback, preserve every observable,
// and leave the existing editor usable afterwards.
const reentries = {
  dispatch: core => core.dispatch({ type: 'selection.set', selection: { regionIds: ['request'], relationIds: [] } }),
  acceptGesture: core => core.acceptGesture({ type: 'selection.changed', selection: { regionIds: ['request'], relationIds: [] } }),
  replaceInput: core => core.replaceInput(replacement()),
  destroy: core => core.destroy(),
};
let reentrantCases = 0;
for (const stage of ['authorize', 'reload', 'commit']) {
  for (const [name, action] of Object.entries(reentries)) {
    const test = harness();
    const prior = structuredClone(test.core.snapshot());
    let entered = 0;
    test.on(stage, () => { entered += 1; action(test.core); });
    assert.throws(() => test.core.replaceInput(replacement()), /nested mutation transaction is not allowed/u, `${stage}/${name}`);
    assert.equal(entered, 1, `${stage}/${name}: attack must reach the intended callback`);
    assert.deepEqual(test.core.snapshot(), prior, `${stage}/${name}: observable state`);
    for (const target of ['render', 'chrome', 'events']) assert.equal(test.calls[target].length, 0, `${stage}/${name}: ${target}`);
    test.on(stage, null);
    assert.equal(test.core.dispatch({ type: 'history.redo' }), true, `${stage}/${name}: editor remains usable`);
    test.core.destroy();
    reentrantCases += 1;
  }
}

// A DocumentPort may retain the candidate it receives. That retained payload
// must not be a hidden mutation capability, during or after commit.
for (const fail of [false, true]) {
  const test = harness();
  const prior = structuredClone(test.core.snapshot());
  let payload = null;
  test.onCommit(value => {
    payload = value;
    value.semantic.regions.get('request').label = 'Injected through Port';
    value.semantic.regions.get('request').bounds.x += 100;
    value.layout.frame.map = 'injected-map';
    value.operations.push({ type: 'invalid' });
    if (fail) throw new Error('E_RETAINED_PORT_THROW');
  });
  if (fail) {
    assert.throws(() => test.core.replaceInput(replacement()), /E_RETAINED_PORT_THROW/u);
    assert.deepEqual(test.core.snapshot(), prior);
    for (const name of ['render', 'chrome', 'events']) assert.equal(test.calls[name].length, 0, `retained failure: ${name}`);
  } else {
    const installed = test.core.replaceInput(replacement());
    assert.equal(installed.records.find(row => row.id === 'request').label, 'Replacement document');
    assert.deepEqual(installed.frame, { map: 'm2', time: 't2' });
    assert.equal(installed.draft.applied, 0);
  }
  assert.ok(payload, 'retained-payload attack must reach commit');
  const after = structuredClone(test.core.snapshot());
  payload.semantic.regions.clear();
  payload.layout.frame.time = 'later-injection';
  assert.deepEqual(test.core.snapshot(), after, 'retained candidate has no authority after return');
  test.core.destroy();
}

const values = harness();
for (const frame of [{ map: 'new-map', time: 'new-time' }, { map: 'new-map', time: 'new-time' }]) {
  const returned = values.core.dispatch({ type: 'frame.set', frame });
  try { returned.map = 'caller-injection'; } catch (error) { assert.ok(error instanceof TypeError); }
  assert.deepEqual(values.core.snapshot().frame, frame, 'changed and no-op frame results must be detached');
}
let laterEvent = null;
values.core.subscribe(event => {
  if (event.kind !== 'mutation') return;
  try { event.operations[0].label = 'listener-injection'; } catch (error) { assert.ok(error instanceof TypeError); }
  try { event.core.records.find(row => row.id === 'request').label = 'snapshot-injection'; } catch (error) { assert.ok(error instanceof TypeError); }
});
values.core.subscribe(event => { laterEvent = event; });
values.core.dispatch({ type: 'RenameRegion', regionId: 'request', label: 'Accepted label' });
assert.equal(laterEvent.operations[0].label, 'Accepted label', 'each subscriber gets an independent event value');
assert.equal(values.core.snapshot().records.find(row => row.id === 'request').label, 'Accepted label');
assert.equal(values.core.snapshot().draft.operations.at(-1).label, 'Accepted label', 'listener must not edit history operations');
const copied = values.core.snapshot();
const unchanged = structuredClone(copied);
try { copied.draft.operations.at(-1).label = 'history-injection'; } catch (error) { assert.ok(error instanceof TypeError); }
try { copied.selection.regionIds.push('not-present'); } catch (error) { assert.ok(error instanceof TypeError); }
assert.deepEqual(values.core.snapshot(), unchanged, 'snapshot sub-values must not edit the owner');
assert.equal(Object.hasOwn(values.core.snapshot(), 'surface'), false, 'logical snapshot must not query physical state');
values.core.destroy();

console.log(JSON.stringify({ schema: 'semantic-map-replace-input-test/2', status: 'PASS', rejectedPaths: failures.length, reentrantCases, retainedPayloadCases: 2, authorizedReplacement: true, commitBeforePublish: true, previousRevisionCAS: true, historyAndIdsSurviveFailure: true, detachedSnapshotRecords: true, threeMethodSurface: true, isolatedSubscriberValues: true, detachedFrameResults: true }));
