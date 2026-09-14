import assert from 'node:assert/strict';
import { createSemanticMap, createSemanticMapEditorCore, reduceOperations } from '../domain/index.js';

const records = [
  { type: 'meta', schema: 'semantic-map-state/1', root: 'root', title: 'Reconnect proof' },
  { type: 'region', id: 'root', parent: null, label: 'Root', kind: 'root', bounds: [0, 0, 800, 600], summary: '' },
  { type: 'region', id: 'a', parent: 'root', label: 'A', kind: 'concept', bounds: [40, 80, 120, 72], summary: '' },
  { type: 'region', id: 'b', parent: 'root', label: 'B', kind: 'concept', bounds: [240, 80, 120, 72], summary: '' },
  { type: 'region', id: 'c', parent: 'root', label: 'C', kind: 'concept', bounds: [440, 80, 120, 72], summary: '' },
  { type: 'relation', id: 'r1', from: 'a', to: 'b', kind: 'relates', label: '' },
];

function harness() {
  let gesture = null;
  let allowed = true;
  const rendered = [];
  const surface = {
    render(value) {
      rendered.push(structuredClone(value.selection ?? null));
      return { kind: 'fake' };
    },
    onGesture(handler) {
      gesture = handler;
      return () => { if (gesture === handler) gesture = null; };
    },
    snapshot: () => ({ kind: 'fake' }),
    destroy: () => { gesture = null; return true; },
  };
  const core = createSemanticMapEditorCore({
    semantic: createSemanticMap(records),
    layout: { selection: { regionIds: [], relationIds: ['r1'] }, frame: null },
    revision: 'r0',
    ports: {
      surface,
      document: {
        requestEdit: ({ operation }) => ({ operations: [operation] }),
        commit: ({ revision }) => ({ revision }),
        reload: ({ input, expectedRevision }) => ({ input, revision: expectedRevision }),
        renderChrome: () => null,
      },
      authority: {
        authorize: () => ({
          allowed,
          code: allowed ? 'ALLOW' : 'E_DENIED',
          reason: allowed ? 'allowed' : 'denied',
        }),
      },
    },
  });
  return {
    core,
    emit: (value) => gesture(value),
    setAllowed: (value) => { allowed = value; },
    rendered,
  };
}

const proof = harness();
const result = proof.emit({ type: 'reconnect-relation', relationId: 'r1', from: 'a', to: 'c' });
assert.equal(result.reconnectedRelationId, 'r1');
assert.deepEqual(proof.core.runtime.domain.relations[0], {
  id: 'r1', from: 'a', to: 'c', kind: 'relates', label: '',
});
assert.equal(proof.core.snapshot().draft.applied, 1, 'reconnect must be one history entry');
assert.deepEqual(proof.core.snapshot().selection, { regionIds: [], relationIds: ['r1'] });

assert.equal(proof.core.dispatch({ type: 'history.undo' }), true);
assert.deepEqual(proof.core.runtime.domain.relations[0], {
  id: 'r1', from: 'a', to: 'b', kind: 'relates', label: '',
});
assert.equal(proof.core.dispatch({ type: 'history.redo' }), true);
assert.deepEqual(proof.core.runtime.domain.relations[0], {
  id: 'r1', from: 'a', to: 'c', kind: 'relates', label: '',
});

const beforeDeny = {
  records: proof.core.runtime.toRecords(),
  draft: proof.core.snapshot().draft,
  selection: proof.core.snapshot().selection,
  sequence: proof.core.snapshot().idSequence,
};
proof.setAllowed(false);
assert.throws(
  () => proof.emit({ type: 'reconnect-relation', relationId: 'r1', from: 'c', to: 'b' }),
  /E_DENIED/u,
);
assert.deepEqual(proof.core.runtime.toRecords(), beforeDeny.records);
assert.deepEqual(proof.core.snapshot().draft, beforeDeny.draft);
assert.deepEqual(proof.core.snapshot().selection, beforeDeny.selection);
assert.equal(proof.core.snapshot().idSequence, beforeDeny.sequence);

const reduced = reduceOperations(records, [
  { type: 'ReconnectRelation', relationId: 'r1', from: 'c', to: 'b' },
]);
assert.deepEqual(reduced.records.at(-1), {
  type: 'relation', id: 'r1', from: 'c', to: 'b', kind: 'relates', label: '',
});
assert.equal(reduced.entries.length, 1);

console.log(JSON.stringify({
  schema: 'semantic-map-reconnect-relation-test/2',
  status: 'PASS',
  relationIdPreserved: true,
  operationCount: 1,
  historyEntries: 1,
  replayable: true,
  denyAtomic: true,
}));
