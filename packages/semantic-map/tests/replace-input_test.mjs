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
  let insideCommit = null;
  const calls = { authorize: [], reload: [], commit: [], render: [], chrome: [], events: [] };
  const core = createSemanticMapEditorCore({
    semantic: records,
    layout: { selection: { regionIds: [], relationIds: [] }, frame: null },
    revision: 'r0',
    ports: {
      surface: {
        render: value => { calls.render.push(structuredClone(value)); },
        onGesture: handler => { gesture = handler; return () => { gesture = null; }; },
        snapshot: () => ({ kind: 'test-surface' }),
        destroy: () => { gesture = null; },
      },
      authority: {
        authorize: value => {
          calls.authorize.push(structuredClone(value));
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
          if (mode === 'reload-throw') throw new Error('E_REPLACE_RELOAD_THROW');
          if (mode === 'reload-async') return Promise.resolve({ input: value.input });
          if (mode === 'reload-invalid') return { input: { schema: 'invalid-workspace' } };
          return { input: value.input, revision: 'loaded-r1' };
        },
        commit: value => {
          calls.commit.push(structuredClone(value));
          insideCommit?.();
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
  return { core, calls, setMode: value => { mode = value; }, onCommit: value => { insideCommit = value; } };
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
// Nested geometry is a value copy, never a reference into the live document.
result.records.find(row => row.id === 'request').bounds[0] += 100;
assert.deepEqual(accepted.core.snapshot().records, detached, 'snapshot values must not mutate semantic state');
accepted.core.destroy();

console.log(JSON.stringify({ schema: 'semantic-map-replace-input-test/1', status: 'PASS', rejectedPaths: failures.length, authorizedReplacement: true, commitBeforePublish: true, previousRevisionCAS: true, historyAndIdsSurviveFailure: true, detachedSnapshotRecords: true }));
