import assert from 'node:assert/strict';
import { createSemanticMap, normalizeOperation, OPERATION_TYPES, SemanticDomainStore } from '../domain/index.js';

const records = [
  { type: 'meta', schema: 'semantic-map-state/1', root: 'root', title: 'Reconnect proof' },
  { type: 'region', id: 'root', parent: null, label: 'Root', kind: 'root', summary: '', bounds: [0, 0, 800, 500] },
  { type: 'region', id: 'a', parent: 'root', label: 'A', kind: 'concept', summary: '', bounds: [40, 80, 120, 70] },
  { type: 'region', id: 'b', parent: 'root', label: 'B', kind: 'concept', summary: '', bounds: [280, 80, 120, 70] },
  { type: 'region', id: 'c', parent: 'root', label: 'C', kind: 'concept', summary: '', bounds: [520, 80, 120, 70] },
  { type: 'relation', id: 'r1', from: 'a', to: 'b', kind: 'relates', label: 'ab' },
  { type: 'relation', id: 'r2', from: 'b', to: 'c', kind: 'relates', label: 'bc' },
];

assert.equal(OPERATION_TYPES.includes('ReconnectRelation'), true);
assert.deepEqual(
  normalizeOperation({ type: 'ReconnectRelation', relationId: 'r1', from: 'a', to: 'c' }),
  { type: 'ReconnectRelation', relationId: 'r1', from: 'a', to: 'c' },
);

const store = new SemanticDomainStore(createSemanticMap(records));
const result = store.perform({ type: 'ReconnectRelation', relationId: 'r1', from: 'a', to: 'c' });
assert.equal(result.reconnectedRelationId, 'r1');
assert.deepEqual(
  store.domain.relations.find((relation) => relation.id === 'r1'),
  { id: 'r1', from: 'a', to: 'c', kind: 'relates', label: 'ab' },
);

assert.equal(store.undo(), true);
assert.equal(store.domain.relations.find((relation) => relation.id === 'r1').to, 'b');
assert.equal(store.redo(), true);
assert.equal(store.domain.relations.find((relation) => relation.id === 'r1').to, 'c');

assert.throws(
  () => store.perform({ type: 'ReconnectRelation', relationId: 'r2', from: 'a', to: 'c' }),
  /same directed relation already exists/,
);
assert.throws(
  () => store.perform({ type: 'ReconnectRelation', relationId: 'r1', from: 'a', to: 'a' }),
  /self relation is not allowed/,
);

console.log(JSON.stringify({
  schema: 'semantic-map-reconnect-relation-test/1',
  status: 'PASS',
  stableRelationId: true,
  undoRedo: true,
  duplicateGuard: true,
  selfLoopGuard: true,
}));
