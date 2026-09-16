import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createSemanticMap,
  createSemanticMapEditorCore,
  parseSemanticMapRecords,
} from '../domain/index.js';
import { createWorkspace } from '../editor-core/index.js';
import { defaultViewForPattern } from '../protocol/index.js';

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
          scene: value.scene ?? null,
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
      snapshot() { return Object.freeze({ kind: 'fake-surface', destroyed }); },
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

function region(core, id) {
  return core.snapshot().records.find(row => row.type === 'region' && row.id === id) ?? null;
}

const first = createHarness();
const { core } = first;
const exactPublicMethods = ['acceptGesture', 'destroy', 'dispatch', 'replaceInput', 'snapshot', 'subscribe'];
assert.deepEqual(Object.keys(core).sort(), exactPublicMethods);
assert.equal(core.perform, undefined);
assert.equal(core.execute, undefined);
assert.equal(core.setMutationPort, undefined);
assert.equal(core.workspace, undefined);
assert.equal(core.runtime, undefined);
assert.deepEqual(core.snapshot().selection, { regionIds: [], relationIds: [] });

const snapshotRecords = core.snapshot().records;
snapshotRecords.find(row => row.type === 'region' && row.id === 'request').label = 'Snapshot mutation';
assert.equal(region(core, 'request').label, '1 依頼', 'snapshot records must be detached from core state');

core.dispatch({
  type: 'presentation.configure',
  projection: {
    view: defaultViewForPattern('graph/1'),
    modules: null,
    presentation: {
      camera: { scale: 1, translateX: 0, translateY: 0 },
      viewport: { x: 0, y: 0, width: 1200, height: 800 },
    },
  },
});
assert.equal(core.snapshot().scene.pattern, 'graph/1');
assert.equal(first.surface.renders.at(-1).scene.pattern, 'graph/1');
assert.deepEqual(first.surface.renders.at(-1).scene, core.snapshot().scene, 'Surface must receive the core-accepted scene');

const stableProjection = structuredClone(core.snapshot());
assert.throws(() => core.dispatch({
  type: 'presentation.configure',
  projection: {
    view: defaultViewForPattern('map/1'),
    presentation: {
      camera: { scale: 1, translateX: 0, translateY: 0 },
      viewport: { x: 0, y: 0, width: 1200, height: 800 },
      uncloneable: () => {},
    },
  },
}), /clone|could not be cloned|DataCloneError/iu);
assert.deepEqual(core.snapshot(), stableProjection, 'rejected presentation clone must preserve accepted projection');
core.dispatch({ type: 'presentation.refresh' });
assert.equal(core.snapshot().scene.pattern, 'graph/1', 'refresh must not adopt a rejected projection');

const throwingPresentation = {};
Object.defineProperty(throwingPresentation, 'camera', {
  enumerable: true,
  get() { throw new Error('E_PRESENTATION_GETTER'); },
});
assert.throws(() => core.dispatch({
  type: 'presentation.configure',
  projection: { view: defaultViewForPattern('map/1'), presentation: throwingPresentation },
}), /E_PRESENTATION_GETTER/u);
assert.equal(core.snapshot().scene.pattern, 'graph/1');
core.dispatch({ type: 'presentation.refresh' });
assert.equal(core.snapshot().scene.pattern, 'graph/1', 'getter failure must not leak a rejected projection');

let retainedProjectionDomain = null;
const stateHashBeforeProjectionCallback = core.snapshot().stateHash;
core.dispatch({
  type: 'presentation.configure',
  projection: {
    view: defaultViewForPattern('graph/1'),
    modules: null,
    projectPresentation(domain) {
      retainedProjectionDomain = domain;
      return null;
    },
    presentation: {
      camera: { scale: 1, translateX: 0, translateY: 0 },
      viewport: { x: 0, y: 0, width: 1200, height: 800 },
    },
  },
});
assert.ok(retainedProjectionDomain?.regions instanceof Map);
retainedProjectionDomain.regions.delete('request');
assert.equal(core.snapshot().document.regions, stableProjection.document.regions);
assert.ok(region(core, 'request'));
assert.equal(core.snapshot().stateHash, stateHashBeforeProjectionCallback);
core.dispatch({ type: 'presentation.refresh' });
assert.ok(region(core, 'request'), 'retained projection callback input must not mutate core state');

const acceptedBeforeCandidate = structuredClone(core.snapshot());
const rendersBeforeCandidate = first.surface.renders.length;
const chromeBeforeCandidate = first.document.chrome.length;
let eventsDuringCandidate = 0;
const removeCandidateListener = core.subscribe(() => { eventsDuringCandidate += 1; });
const candidateRecords = structuredClone(core.snapshot().records);
candidateRecords.find(row => row.type === 'region' && row.id === 'request').label = 'Candidate only';
const candidateScene = core.dispatch({
  type: 'presentation.project',
  semantic: candidateRecords,
  view: defaultViewForPattern('map/1'),
  modules: null,
  presentation: {
    camera: { scale: 1, translateX: 0, translateY: 0 },
    viewport: { x: 0, y: 0, width: 1200, height: 800 },
  },
});
removeCandidateListener();
assert.equal(candidateScene.pattern, 'map/1');
assert.equal(candidateScene.representations.find(item => item.regionId === 'request').label, 'Candidate only');
assert.deepEqual(core.snapshot(), acceptedBeforeCandidate, 'candidate projection must not replace accepted state');
assert.equal(first.surface.renders.length, rendersBeforeCandidate, 'candidate projection must not render accepted SurfacePort');
assert.equal(first.document.chrome.length, chromeBeforeCandidate, 'candidate projection must not render accepted chrome');
assert.equal(eventsDuringCandidate, 0, 'candidate projection must not publish core events');

let candidateReentryMode = 'setup';
let candidateReentryCallbacks = 0;
let candidateReentrySnapshot = null;
core.dispatch({
  type: 'presentation.configure',
  projection: {
    view: defaultViewForPattern('graph/1'),
    modules: null,
    projectPresentation() {
      if (candidateReentryMode === 'setup') return null;
      candidateReentryCallbacks += 1;
      candidateReentrySnapshot = core.snapshot();
      assert.throws(() => core.dispatch({ type: 'frame.set', frame: { id: 'forbidden' } }), /nested mutation transaction/u);
      assert.throws(() => core.acceptGesture({ type: 'selection.changed', selection: { regionIds: ['request'], relationIds: [] } }), /nested mutation transaction/u);
      assert.throws(() => core.replaceInput(core.snapshot().records), /nested mutation transaction/u);
      assert.throws(() => core.destroy(), /nested mutation transaction/u);
      if (candidateReentryMode === 'throw') throw new Error('E_CANDIDATE_PROJECTION_CALLBACK');
      return null;
    },
    presentation: {
      camera: { scale: 1, translateX: 0, translateY: 0 },
      viewport: { x: 0, y: 0, width: 1200, height: 800 },
    },
  },
});
const acceptedBeforeReentry = structuredClone(core.snapshot());
const rendersBeforeReentry = first.surface.renders.length;
const chromeBeforeReentry = first.document.chrome.length;
let eventsDuringReentry = 0;
const removeReentryListener = core.subscribe(() => { eventsDuringReentry += 1; });
for (const mode of ['return', 'throw']) {
  candidateReentryMode = mode;
  const project = () => core.dispatch({
    type: 'presentation.project',
    semantic: candidateRecords,
    view: defaultViewForPattern('map/1'),
    modules: null,
    presentation: {
      camera: { scale: 1, translateX: 0, translateY: 0 },
      viewport: { x: 0, y: 0, width: 1200, height: 800 },
    },
  });
  if (mode === 'throw') assert.throws(project, /E_CANDIDATE_PROJECTION_CALLBACK/u);
  else assert.equal(project().pattern, 'map/1');
  assert.deepEqual(candidateReentrySnapshot, acceptedBeforeReentry, `candidate ${mode} callback must observe accepted snapshot`);
  assert.deepEqual(core.snapshot(), acceptedBeforeReentry, `candidate ${mode} callback must not mutate accepted state`);
  assert.equal(first.surface.renders.length, rendersBeforeReentry, `candidate ${mode} callback must not render SurfacePort`);
  assert.equal(first.document.chrome.length, chromeBeforeReentry, `candidate ${mode} callback must not render chrome`);
  assert.equal(eventsDuringReentry, 0, `candidate ${mode} callback must not publish events`);
}
removeReentryListener();
candidateReentryMode = 'setup';
assert.equal(candidateReentryCallbacks, 2);
core.dispatch({ type: 'frame.set', frame: { id: 'after-candidate' } });
assert.deepEqual(core.snapshot().frame, { id: 'after-candidate' }, 'normal dispatch must recover after candidate projection');
core.dispatch({ type: 'frame.set', frame: null });

core.acceptGesture({ type: 'selection.changed', selection: { regionIds: ['request'], relationIds: [] } });
assert.deepEqual(core.snapshot().selection, { regionIds: ['request'], relationIds: [] });

const renamed = core.dispatch({ type: 'RenameRegion', regionId: 'request', label: 'Core-owned rename' });
assert.deepEqual(renamed.regionIds, ['request']);
assert.equal(region(core, 'request').label, 'Core-owned rename');
assert.equal(core.snapshot().scene.representations.find(item => item.regionId === 'request').label, 'Core-owned rename');
assert.equal(core.snapshot().draft.applied, 1);
assert.equal(core.dispatch({ type: 'history.undo' }), true);
assert.equal(region(core, 'request').label, '1 依頼');
assert.equal(core.dispatch({ type: 'history.redo' }), true);
assert.equal(region(core, 'request').label, 'Core-owned rename');

const created = core.dispatch({
  type: 'AddRegion', parentId: 'map', label: 'Core-created', kind: 'concept', summary: '', bounds: [40, 610, 150, 72],
});
assert.equal(created.createdRegionId, 'region.core-1');
assert.deepEqual(core.snapshot().selection, { regionIds: ['region.core-1'], relationIds: [] });

const sequenceBeforeDeny = core.snapshot().idSequence;
const historyBeforeDeny = core.snapshot().draft.applied;
first.authority.allowed = false;
assert.throws(() => core.dispatch({
  type: 'AddRegion', parentId: 'map', label: 'Denied', kind: 'concept', summary: '', bounds: [220, 610, 150, 72],
}), /E_DENIED/u);
assert.equal(core.snapshot().idSequence, sequenceBeforeDeny);
assert.equal(core.snapshot().draft.applied, historyBeforeDeny);
assert.equal(region(core, 'region.core-2'), null);

first.authority.allowed = true;
const retried = core.dispatch({
  type: 'AddRegion', parentId: 'map', label: 'Allowed after deny', kind: 'concept', summary: '', bounds: [220, 610, 150, 72],
});
assert.equal(retried.createdRegionId, 'region.core-2');

const firstSnapshot = core.snapshot();
const workspace = createWorkspace(firstSnapshot.records, { selection: firstSnapshot.selection, frame: firstSnapshot.frame });
const second = createHarness();
second.core.replaceInput(workspace);
assert.ok(region(second.core, 'region.core-2'));
assert.deepEqual(second.core.snapshot().selection, core.snapshot().selection);

const beforeSecondSelection = second.core.snapshot().selection;
core.acceptGesture({ type: 'selection.changed', selection: { regionIds: ['request'], relationIds: [] } });
assert.deepEqual(second.core.snapshot().selection, beforeSecondSelection, 'editors must not share a gesture owner');

const failed = createHarness();
let coreEvents = 0;
failed.core.subscribe(() => { coreEvents += 1; });
const beforeFailedSnapshot = structuredClone(failed.core.snapshot());
const rendersBeforeFailure = failed.surface.renders.length;
const chromeBeforeFailure = failed.document.chrome.length;
failed.document.setFailCommit(true);
assert.throws(() => failed.core.dispatch({
  type: 'AddRegion', parentId: 'map', label: 'Must rollback', kind: 'concept', summary: '', bounds: [40, 610, 150, 72],
}), /test document commit failed/u);
assert.deepEqual(failed.core.snapshot(), beforeFailedSnapshot);
assert.equal(failed.surface.renders.length, rendersBeforeFailure);
assert.equal(failed.document.chrome.length, chromeBeforeFailure);
assert.equal(coreEvents, 0);
assert.equal(region(failed.core, 'region.core-1'), null);

failed.document.setFailCommit(false);
const afterFailure = failed.core.dispatch({
  type: 'AddRegion', parentId: 'map', label: 'Committed after rollback', kind: 'concept', summary: '', bounds: [40, 610, 150, 72],
});
assert.equal(afterFailure.createdRegionId, 'region.core-1', 'failed commit must not consume an ID');
assert.equal(failed.surface.renders.length, rendersBeforeFailure + 1);
assert.equal(failed.document.chrome.length, chromeBeforeFailure + 1);
assert.equal(coreEvents, 1, 'successful commit publishes one core event');

assert.equal(core.destroy(), true);
assert.equal(core.destroy(), false);
assert.equal(first.surface.destroyed(), true);
assert.throws(() => core.dispatch({ type: 'history.undo' }), /destroyed/u);
assert.throws(() => first.surface.emit({ type: 'selection.changed', selection: { regionIds: [], relationIds: [] } }), /surface gesture handler unavailable/u);

const remounted = createHarness();
assert.equal(remounted.core.dispatch({ type: 'RenameRegion', regionId: 'request', label: 'Remounted' }).regionIds[0], 'request');
assert.equal(region(remounted.core, 'request').label, 'Remounted');

console.log(JSON.stringify({
  schema: 'semantic-map-editor-core-test/3',
  status: 'PASS',
  publicFactory: true,
  exactPublicMethods,
  rawMutationBypassAbsent: true,
  hiddenRuntimeAbsent: true,
  hiddenWorkspaceAbsent: true,
  snapshotDetached: true,
  coreOwnsAcceptedSceneProjection: true,
  candidateProjectionReadOnly: true,
  candidateProjectionReentryGuard: true,
  projectionConfigureAtomic: true,
  projectionCallbackDetached: true,
  authorityDenyAtomic: true,
  commitFailureAtomic: true,
  commitBeforePublish: true,
  deterministicIds: true,
  independentEditors: true,
  idempotentDestroy: true,
  remount: true,
}));