import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createSemanticMap,
  createSemanticMapEditorCore,
  parseSemanticMapRecords,
} from '../domain/index.js';

const records = parseSemanticMapRecords(
  fs.readFileSync(new URL('../examples/example.jsonl', import.meta.url), 'utf8'),
);

function surfacePort() {
  let handler = null;
  let destroyed = false;
  const renders = [];
  return {
    port: {
      render(value) {
        if (destroyed) return null;
        renders.push(structuredClone({
          selection: value.selection,
          activeFrame: value.activeFrame,
        }));
        return { kind: 'fake-surface', destroyed: false };
      },
      onGesture(value) {
        assert.equal(handler, null);
        handler = value;
        return () => { if (handler === value) handler = null; };
      },
      snapshot() {
        return Object.freeze({ kind: 'fake-surface', destroyed });
      },
      destroy() {
        if (destroyed) return false;
        destroyed = true;
        handler = null;
        return true;
      },
    },
    emit(gesture) {
      if (typeof handler !== 'function') throw new Error('surface gesture handler unavailable');
      return handler(gesture);
    },
    renders,
    destroyed: () => destroyed,
  };
}

function documentPort() {
  const commits = [];
  return {
    port: {
      requestEdit: ({ operation }) => Object.freeze({ operations: Object.freeze([operation]) }),
      commit: (value) => {
        commits.push(value);
        return Object.freeze({ revision: value.expectedRevision });
      },
      reload: ({ input, expectedRevision }) => Object.freeze({ input, revision: expectedRevision }),
      renderChrome: () => null,
    },
    commits,
  };
}

function createHarness({ allowed = true } = {}) {
  const surface = surfacePort();
  const document = documentPort();
  const authority = { allowed };
  const core = createSemanticMapEditorCore({
    semantic: createSemanticMap(records),
    layout: { selection: { regionIds: [], relationIds: [] }, frame: null },
    revision: 'r0',
    ports: {
      surface: surface.port,
      document: document.port,
      authority: {
        authorize: () => Object.freeze({
          allowed: authority.allowed,
          code: authority.allowed ? 'ALLOW' : 'E_DENIED',
          reason: authority.allowed ? 'test allow' : 'test deny',
        }),
      },
    },
  });
  return { authority, core, document, surface };
}

const first = createHarness();
const { core } = first;

assert.equal(core.perform, undefined);
assert.equal(core.execute, undefined);
assert.equal(core.setMutationPort, undefined);
assert.deepEqual(core.snapshot().selection, { regionIds: [], relationIds: [] });

core.acceptGesture({
  type: 'selection.changed',
  selection: { regionIds: ['request'], relationIds: [] },
});
assert.deepEqual(core.snapshot().selection, { regionIds: ['request'], relationIds: [] });

const renamed = core.dispatch({ type: 'RenameRegion', regionId: 'request', label: 'Core-owned rename' });
assert.deepEqual(renamed.regionIds, ['request']);
assert.equal(core.runtime.domain.regions.get('request').label, 'Core-owned rename');
assert.equal(core.snapshot().draft.applied, 1);
assert.equal(core.dispatch({ type: 'history.undo' }), true);
assert.equal(core.runtime.domain.regions.get('request').label, '1 依頼');
assert.equal(core.dispatch({ type: 'history.redo' }), true);
assert.equal(core.runtime.domain.regions.get('request').label, 'Core-owned rename');

const created = core.dispatch({
  type: 'AddRegion',
  parentId: 'map',
  label: 'Core-created',
  kind: 'concept',
  summary: '',
  bounds: [40, 610, 150, 72],
});
assert.equal(created.createdRegionId, 'region.core-1');
assert.deepEqual(core.snapshot().selection, { regionIds: ['region.core-1'], relationIds: [] });

const sequenceBeforeDeny = core.snapshot().idSequence;
const historyBeforeDeny = core.snapshot().draft.applied;
first.authority.allowed = false;
assert.throws(() => core.dispatch({
  type: 'AddRegion',
  parentId: 'map',
  label: 'Denied',
  kind: 'concept',
  summary: '',
  bounds: [220, 610, 150, 72],
}), /E_DENIED/u);
assert.equal(core.snapshot().idSequence, sequenceBeforeDeny);
assert.equal(core.snapshot().draft.applied, historyBeforeDeny);
assert.equal(core.runtime.domain.regions.has('region.core-2'), false);

first.authority.allowed = true;
const retried = core.dispatch({
  type: 'AddRegion',
  parentId: 'map',
  label: 'Allowed after deny',
  kind: 'concept',
  summary: '',
  bounds: [220, 610, 150, 72],
});
assert.equal(retried.createdRegionId, 'region.core-2');

const workspace = core.workspace();
const second = createHarness();
second.core.replaceInput(workspace);
assert.equal(second.core.runtime.domain.regions.has('region.core-2'), true);
assert.deepEqual(second.core.snapshot().selection, core.snapshot().selection);

const beforeSecondSelection = second.core.snapshot().selection;
core.acceptGesture({
  type: 'selection.changed',
  selection: { regionIds: ['request'], relationIds: [] },
});
assert.deepEqual(second.core.snapshot().selection, beforeSecondSelection, 'editors must not share a gesture owner');

assert.equal(core.destroy(), true);
assert.equal(core.destroy(), false);
assert.equal(first.surface.destroyed(), true);
assert.throws(() => core.dispatch({ type: 'history.undo' }), /destroyed/u);
assert.throws(() => first.surface.emit({
  type: 'selection.changed',
  selection: { regionIds: [], relationIds: [] },
}), /function/u);

const remounted = createHarness();
assert.equal(remounted.core.dispatch({
  type: 'RenameRegion',
  regionId: 'request',
  label: 'Remounted',
}).regionIds[0], 'request');
assert.equal(remounted.core.runtime.domain.regions.get('request').label, 'Remounted');

console.log(JSON.stringify({
  schema: 'semantic-map-editor-core-test/2',
  status: 'PASS',
  publicFactory: true,
  rawMutationBypassAbsent: true,
  authorityDenyAtomic: true,
  deterministicIds: true,
  independentEditors: true,
  idempotentDestroy: true,
  remount: true,
}));
