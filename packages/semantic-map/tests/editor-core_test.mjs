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
  const chrome = [];
  let failCommit = false;
  return {
    port: {
      requestEdit: ({ operation }) => Object.freeze({ operations: Object.freeze([operation]) }),
      commit: (value) => {
        commits.push(value);
        if (failCommit) throw new Error('test document commit failed');
        return Object.freeze({ revision: value.expectedRevision });
      },
      reload: ({ input, expectedRevision }) => Object.freeze({ input, revision: expectedRevision }),
      renderChrome: (value) => { chrome.push(structuredClone(value)); },
    },
    commits,
    chrome,
    setFailCommit(value) { failCommit = value === true; },
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

const failed = createHarness();
let coreEvents = 0;
let domainEvents = 0;
failed.core.subscribe(() => { coreEvents += 1; });
failed.core.runtime.onChange(() => { domainEvents += 1; });
const beforeFailedWorkspace = structuredClone(failed.core.workspace());
const beforeFailedSnapshot = structuredClone(failed.core.snapshot());
const rendersBeforeFailure = failed.surface.renders.length;
const chromeBeforeFailure = failed.document.chrome.length;
failed.document.setFailCommit(true);
assert.throws(() => failed.core.dispatch({
  type: 'AddRegion',
  parentId: 'map',
  label: 'Must rollback',
  kind: 'concept',
  summary: '',
  bounds: [40, 610, 150, 72],
}), /test document commit failed/u);
assert.deepEqual(failed.core.workspace(), beforeFailedWorkspace);
assert.deepEqual(failed.core.snapshot(), beforeFailedSnapshot);
assert.equal(failed.surface.renders.length, rendersBeforeFailure);
assert.equal(failed.document.chrome.length, chromeBeforeFailure);
assert.equal(coreEvents, 0);
assert.equal(domainEvents, 0);
assert.equal(failed.core.runtime.domain.regions.has('region.core-1'), false);

failed.document.setFailCommit(false);
const afterFailure = failed.core.dispatch({
  type: 'AddRegion',
  parentId: 'map',
  label: 'Committed after rollback',
  kind: 'concept',
  summary: '',
  bounds: [40, 610, 150, 72],
});
assert.equal(afterFailure.createdRegionId, 'region.core-1', 'failed commit must not consume an ID');
assert.equal(failed.surface.renders.length, rendersBeforeFailure + 1);
assert.equal(failed.document.chrome.length, chromeBeforeFailure + 1);
assert.equal(coreEvents, 1, 'successful commit publishes one core event');
assert.equal(domainEvents, 1, 'successful commit publishes one domain event');

assert.equal(core.destroy(), true);
assert.equal(core.destroy(), false);
assert.equal(first.surface.destroyed(), true);
assert.throws(() => core.dispatch({ type: 'history.undo' }), /destroyed/u);
assert.throws(() => first.surface.emit({
  type: 'selection.changed',
  selection: { regionIds: [], relationIds: [] },
}), /surface gesture handler unavailable/u);

const remounted = createHarness();
assert.equal(remounted.core.dispatch({
  type: 'RenameRegion',
  regionId: 'request',
  label: 'Remounted',
}).regionIds[0], 'request');
assert.equal(remounted.core.runtime.domain.regions.get('request').label, 'Remounted');

console.log(JSON.stringify({
  schema: 'semantic-map-editor-core-test/3',
  status: 'PASS',
  publicFactory: true,
  rawMutationBypassAbsent: true,
  authorityDenyAtomic: true,
  commitFailureAtomic: true,
  commitBeforePublish: true,
  deterministicIds: true,
  independentEditors: true,
  idempotentDestroy: true,
  remount: true,
}));
