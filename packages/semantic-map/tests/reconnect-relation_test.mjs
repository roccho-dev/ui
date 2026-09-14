import assert from 'node:assert/strict';
import { EditorCore, createSemanticMap, reduceOperations } from '../domain/index.js';

const records = [
  { type: 'meta', schema: 'semantic-map-state/1', root: 'root', title: 'Reconnect proof' },
  { type: 'region', id: 'root', parent: null, label: 'Root', kind: 'root', bounds: [0, 0, 800, 600], summary: '' },
  { type: 'region', id: 'a', parent: 'root', label: 'A', kind: 'concept', bounds: [40, 80, 120, 72], summary: '' },
  { type: 'region', id: 'b', parent: 'root', label: 'B', kind: 'concept', bounds: [240, 80, 120, 72], summary: '' },
  { type: 'region', id: 'c', parent: 'root', label: 'C', kind: 'concept', bounds: [440, 80, 120, 72], summary: '' },
  { type: 'relation', id: 'r1', from: 'a', to: 'b', kind: 'relates', label: '' },
];

const core = EditorCore.detached(createSemanticMap(records));
core.setMutationPort((operation) => core.perform(operation));
core.setSelection({ regionIds: [], relationIds: ['r1'] });

const result = core.dispatch({ type: 'ReconnectRelation', relationId: 'r1', from: 'a', to: 'c' });
assert.equal(result.reconnectedRelationId, 'r1');
assert.deepEqual(core.domain.relations[0], { id: 'r1', from: 'a', to: 'c', kind: 'relates', label: '' });
assert.equal(core.draftSnapshot().applied, 1, 'reconnect must be one history entry');
assert.deepEqual(core.selectionSnapshot(), { regionIds: [], relationIds: ['r1'] });

assert.equal(core.undo(), true);
assert.deepEqual(core.domain.relations[0], { id: 'r1', from: 'a', to: 'b', kind: 'relates', label: '' });
assert.equal(core.redo(), true);
assert.deepEqual(core.domain.relations[0], { id: 'r1', from: 'a', to: 'c', kind: 'relates', label: '' });

const reduced = reduceOperations(records, [
  { type: 'ReconnectRelation', relationId: 'r1', from: 'c', to: 'b' },
]);
assert.deepEqual(reduced.records.at(-1), { type: 'relation', id: 'r1', from: 'c', to: 'b', kind: 'relates', label: '' });
assert.equal(reduced.entries.length, 1);

console.log(JSON.stringify({
  schema: 'semantic-map-reconnect-relation-test/1',
  status: 'PASS',
  relationIdPreserved: true,
  operationCount: 1,
  historyEntries: 1,
  replayable: true,
}));
