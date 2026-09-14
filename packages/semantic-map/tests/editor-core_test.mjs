import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  EditorCore,
  createSemanticMap,
  parseSemanticMapRecords,
} from '../domain/index.js';

const records = parseSemanticMapRecords(
  fs.readFileSync(new URL('../examples/example.jsonl', import.meta.url), 'utf8'),
);
const core = EditorCore.detached(createSemanticMap(records));
core.setMutationPort((operation) => core.perform(operation));

assert.deepEqual(core.selectionSnapshot(), { regionIds: [], relationIds: [] });
core.setSelection({ regionIds: ['request'], relationIds: [] });
assert.deepEqual(core.selectionSnapshot(), { regionIds: ['request'], relationIds: [] });

const renamed = core.dispatch({ type: 'RenameRegion', regionId: 'request', label: 'Core-owned rename' });
assert.deepEqual(renamed.regionIds, ['request']);
assert.equal(core.domain.regions.get('request').label, 'Core-owned rename');
assert.equal(core.draftSnapshot().applied, 1);
assert.equal(core.undo(), true);
assert.equal(core.domain.regions.get('request').label, '1 依頼');
assert.equal(core.redo(), true);
assert.equal(core.domain.regions.get('request').label, 'Core-owned rename');

const created = core.dispatch({
  type: 'AddRegion',
  parentId: 'map',
  label: 'Core-created',
  kind: 'concept',
  summary: '',
  bounds: [40, 610, 150, 72],
});
assert.equal(created.createdRegionId, 'region.core-1');
assert.deepEqual(core.selectionSnapshot(), { regionIds: ['region.core-1'], relationIds: [] });

const sequenceBeforeDeny = core.snapshot().idSequence;
core.setMutationPort(() => {
  throw new Error('authority denied');
});
assert.throws(() => core.dispatch({
  type: 'AddRegion',
  parentId: 'map',
  label: 'Denied',
  kind: 'concept',
  summary: '',
  bounds: [220, 610, 150, 72],
}), /authority denied/u);
assert.equal(core.snapshot().idSequence, sequenceBeforeDeny);
assert.equal(core.domain.regions.has('region.core-2'), false);

core.setMutationPort((operation) => core.perform(operation));
const retried = core.dispatch({
  type: 'AddRegion',
  parentId: 'map',
  label: 'Allowed after deny',
  kind: 'concept',
  summary: '',
  bounds: [220, 610, 150, 72],
});
assert.equal(retried.createdRegionId, 'region.core-2', 'deny must not consume the logical ID sequence');

const workspace = core.workspace();
const clone = EditorCore.detached(createSemanticMap(records));
clone.replaceInput(workspace);
assert.equal(clone.domain.regions.has('region.core-2'), true);
assert.deepEqual(clone.selectionSnapshot(), core.selectionSnapshot());

console.log(JSON.stringify({
  schema: 'semantic-map-editor-core-test/1',
  status: 'PASS',
  owner: 'EditorCore',
  deterministicIds: true,
  denyPreservesSequence: true,
  documentSessionHistory: true,
}));
