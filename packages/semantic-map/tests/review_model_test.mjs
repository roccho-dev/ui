import assert from 'node:assert/strict';
import {
  OPERATION_TYPES,
} from '../domain/index.js';
import {
  appendDecision,
  createDecision,
  createDecisionLog,
} from '../protocol/index.js';
import {
  REVIEW_MODEL_SCHEMA,
  createSemanticReviewModel,
} from '../authoring/review-model.js';
import {
  REVIEW_OVERLAY_SCHEMA,
  createSemanticReviewOverlay,
} from '../authoring/review-overlay.js';

const records = [
  { type: 'meta', schema: 'semantic-map-state/1', root: 'map', title: 'Review model test' },
  { type: 'region', id: 'map', parent: null, label: 'Map', kind: 'root', bounds: [0, 0, 900, 640], summary: '' },
  { type: 'region', id: 'actor', parent: 'map', label: 'Actor', kind: 'actor', bounds: [20, 20, 120, 60], summary: '' },
  {
    type: 'region', id: 'task-a', parent: 'map', label: 'Task A', kind: 'task', bounds: [50, 100, 160, 80], summary: '',
    order: 1, value: 10, temporal: { actor: 'actor', ordinal: { start: 0, end: 1 } },
  },
  { type: 'region', id: 'task-b', parent: 'map', label: 'Task B', kind: 'task', bounds: [320, 100, 160, 80], summary: '' },
  { type: 'region', id: 'set-a', parent: 'map', label: 'Set A', kind: 'set', bounds: [50, 280, 240, 180], summary: '', set: { complete: true } },
  { type: 'region', id: 'mountable', parent: 'map', label: 'Mountable', kind: 'concept', bounds: [560, 100, 160, 80], summary: '' },
  { type: 'region', id: 'mounted', parent: 'map', label: 'Mounted', kind: 'concept', bounds: [560, 260, 160, 80], summary: '', mount: { src: '/child#smap=fixture' } },
  { type: 'relation', id: 'r1', from: 'task-a', to: 'task-b', kind: 'dependency', label: 'before' },
];

const operations = [
  { type: 'MoveRegions', regionIds: ['task-a'], dx: 5, dy: 7 },
  { type: 'ResizeRegions', items: [{ regionId: 'task-a', bounds: [55, 107, 180, 90] }] },
  { type: 'PlaceTemporalRegions', axis: 'ordinal', items: [{ regionId: 'task-a', actor: 'actor', start: 2, end: 4 }] },
  { type: 'RenameRegion', regionId: 'task-a', label: 'Task A2' },
  { type: 'SetRegionOrder', regionId: 'task-a', order: 3 },
  { type: 'SetRegionValue', regionId: 'task-a', value: 25 },
  { type: 'SetRegionLink', regionId: 'task-a', href: 'https://example.test/task-a' },
  { type: 'SetSetCompleteness', regionId: 'set-a', complete: false },
  { type: 'AddRegion', regionId: 'added', parentId: 'map', label: 'Added', kind: 'concept', summary: '', bounds: [320, 300, 160, 80] },
  { type: 'ConnectRegions', relationId: 'r2', from: 'task-b', to: 'set-a', kind: 'relates', label: '' },
  { type: 'MountRegionModule', regionId: 'mountable', src: '/child#smap=next' },
  { type: 'UnmountRegionModule', regionId: 'mounted' },
  { type: 'RemoveSelection', regionIds: [], relationIds: ['r1'] },
];

const log = await createDecisionLog(records, 'urn:test:semantic-review-model');

async function previewFor(nextOperations) {
  const created = await createDecision(log.head, nextOperations, log.records);
  return appendDecision(log.log, created.decision);
}

const proposalTypes = OPERATION_TYPES.filter((type) => type !== 'CreateMap').sort();
assert.deepEqual(operations.map((operation) => operation.type).sort(), proposalTypes);

for (const operation of operations) {
  const model = await createSemanticReviewModel({ preview: await previewFor([operation]) });
  assert.equal(model.schema, REVIEW_MODEL_SCHEMA);
  assert.equal(model.authority, false);
  assert.equal(model.status, 'proposal');
  assert.equal(model.baseLabel, 'base');
  assert.equal(model.trace.length, 1);
  assert.equal(model.trace[0].type, operation.type);
  assert.match(model.trace[0].summary, new RegExp(`^${operation.type} · `, 'u'));
  assert.equal(model.delta.netNoop, false, operation.type);
  assert.equal(model.identities.proposalParent, log.head);
  assert.equal(model.identities.baseHead, log.head);
  assert.equal(model.identities.baseStateHash, log.stateHash);
  assert.equal(model.identities.proposalStateHash, model.identities.afterStateHash);
  assert.equal(model.identities.proposalId, model.identities.afterHead);
}

const moved = await createSemanticReviewModel({ preview: await previewFor([operations[0]]) });
assert.deepEqual(moved.delta.regions[0].changedFields, ['bounds[0]', 'bounds[1]']);
assert.equal(moved.delta.regions[0].id, 'task-a');
assert.equal(moved.delta.regions[0].status, 'changed');

assert.equal(Object.isFrozen(moved.delta.regions[0].after.bounds), true);
assert.throws(() => { moved.delta.regions[0].after.bounds[0] = 999; }, TypeError);

const added = await createSemanticReviewModel({ preview: await previewFor([operations[8]]) });
assert.deepEqual(added.delta.regions.map((item) => [item.id, item.status]), [['added', 'added']]);
assert.deepEqual(added.decorations.regions.map((item) => [item.id, item.status]), [['added', 'added']]);

const removed = await createSemanticReviewModel({ preview: await previewFor([operations[12]]) });
assert.deepEqual(removed.delta.relations.map((item) => [item.id, item.status]), [['r1', 'removed']]);
assert.equal(removed.delta.relations[0].before.label, 'before');
assert.equal(removed.delta.relations[0].after, null);

const noOpPreview = await previewFor([
  { type: 'RenameRegion', regionId: 'task-a', label: 'Temporary' },
  { type: 'RenameRegion', regionId: 'task-a', label: 'Task A' },
]);
const noOp = await createSemanticReviewModel({ preview: noOpPreview });
assert.equal(noOp.trace.length, 2);
assert.equal(noOp.delta.netNoop, true);
assert.equal(noOp.delta.counts.changed, 0);
assert.equal(noOp.trace.every((item) => item.effect.netNoop === false), true);

const metadata = {
  reason: 'Remove an obsolete dependency.',
  sourceRefs: ['https://github.com/roccho-dev/ui/issues/197', 'sha256:source'],
  assessment: 'The proposal changes one relation and does not alter authority.',
};
const withMetadata = await createSemanticReviewModel({ preview: await previewFor([operations[12]]), metadata });
const withOtherReason = await createSemanticReviewModel({
  preview: await previewFor([operations[12]]),
  metadata: { ...metadata, reason: 'A different non-authority rationale.' },
});
assert.equal(withMetadata.identities.proposalId, withOtherReason.identities.proposalId);
assert.equal(withMetadata.identities.proposalStateHash, withOtherReason.identities.proposalStateHash);
assert.notEqual(withMetadata.identities.proposalDigest, withOtherReason.identities.proposalDigest);
assert.deepEqual(withMetadata.provenance.sourceRefs, metadata.sourceRefs);
assert.equal(withMetadata.baseLabel, 'base');

const currentInput = {
  preview: await previewFor([operations[12]]),
  metadata: {
    ...metadata,
    currentProof: { verified: true, baseHead: log.head, baseStateHash: log.stateHash },
  },
};
await assert.rejects(
  createSemanticReviewModel(currentInput),
  /current proof requires an upstream verifier/u,
);
const current = await createSemanticReviewModel({
  ...currentInput,
  currentProofVerifier: async (proof, expected) => (
    proof.baseHead === expected.baseHead && proof.baseStateHash === expected.baseStateHash
  ),
});
assert.equal(current.baseLabel, 'current');
assert.equal(current.provenance.currentProof.verified, true);
await assert.rejects(
  createSemanticReviewModel({ ...currentInput, currentProofVerifier: async () => false }),
  /was not verified by the upstream boundary/u,
);
await assert.rejects(
  createSemanticReviewModel({
    preview: await previewFor([operations[12]]),
    metadata: { currentProof: { verified: true, baseHead: log.head, baseStateHash: 'sha256:bad' } },
  }),
  /baseStateHash does not match/u,
);
await assert.rejects(
  createSemanticReviewModel({
    preview: await previewFor([operations[12]]),
    metadata: { sourceRefs: ['same', 'same'] },
  }),
  /must be unique/u,
);

const forgedPreview = await previewFor([operations[3]]);
await assert.rejects(
  createSemanticReviewModel({
    preview: {
      ...forgedPreview,
      entries: [{ ...forgedPreview.entries[0], operation: { type: 'CreateMap' } }],
    },
  }),
  /unsupported proposal Operation CreateMap/u,
);

const removedRegion = await createSemanticReviewModel({
  preview: await previewFor([{ type: 'RemoveSelection', regionIds: ['task-b'], relationIds: [] }]),
});
assert.deepEqual(removedRegion.delta.regions.map((item) => [item.id, item.status]), [['task-b', 'removed']]);
assert.deepEqual(removedRegion.delta.relations.map((item) => [item.id, item.status]), [['r1', 'removed']]);

const fakeBeforeScene = {
  selectionProxies: { 'task-a': 'task-a', 'task-b': 'task-b' },
  representations: [
    { sourceRegionId: 'task-a', regionId: 'task-a', moduleNamespace: null, bounds: { x: 50, y: 100, width: 160, height: 80 } },
    { sourceRegionId: 'task-b', regionId: 'task-b', moduleNamespace: null, bounds: { x: 320, y: 100, width: 160, height: 80 } },
  ],
  relations: [{ sceneId: 'root', relationIds: ['r1'], from: 'task-a', to: 'task-b' }],
};
const fakeAfterScene = {
  selectionProxies: { 'task-a': 'task-a', 'task-b': 'task-b' },
  representations: [
    { sourceRegionId: 'task-a', regionId: 'task-a', moduleNamespace: null, bounds: { x: 55, y: 107, width: 160, height: 80 } },
    { sourceRegionId: 'task-b', regionId: 'task-b', moduleNamespace: null, bounds: { x: 320, y: 100, width: 160, height: 80 } },
  ],
  relations: [],
};
const movedOverlay = createSemanticReviewOverlay(moved, fakeBeforeScene, fakeAfterScene);
assert.equal(movedOverlay.schema, REVIEW_OVERLAY_SCHEMA);
assert.equal(movedOverlay.authority, false);
assert.equal(movedOverlay.regions[0].status, 'changed');
assert.deepEqual(movedOverlay.regions[0].beforeBounds, { x: 50, y: 100, width: 160, height: 80 });
assert.deepEqual(movedOverlay.regions[0].afterBounds, { x: 55, y: 107, width: 160, height: 80 });
const removedOverlay = createSemanticReviewOverlay(removed, fakeBeforeScene, fakeAfterScene);
assert.equal(removedOverlay.relations[0].status, 'removed');
assert.equal(removedOverlay.relations[0].before.from.x, 130);
assert.equal(removedOverlay.relations[0].after, null);

const fakeAfterRemovedScene = {
  selectionProxies: { 'task-a': 'task-a' },
  representations: [
    { sourceRegionId: 'task-a', regionId: 'task-a', moduleNamespace: null, bounds: { x: 50, y: 100, width: 160, height: 80 } },
  ],
  relations: [],
};
const removedRegionOverlay = createSemanticReviewOverlay(removedRegion, fakeBeforeScene, fakeAfterRemovedScene);
assert.equal(removedRegionOverlay.regions[0].status, 'removed');
assert.deepEqual(removedRegionOverlay.regions[0].beforeBounds, { x: 320, y: 100, width: 160, height: 80 });
assert.equal(removedRegionOverlay.regions[0].afterBounds, null);

console.log(JSON.stringify({
  schema: 'semantic-map-review-model-test/1',
  status: 'PASS',
  operationTypes: proposalTypes.length,
  netNoopTrace: noOp.trace.length,
  currentLabelRequiresProof: true,
  overlay: REVIEW_OVERLAY_SCHEMA,
}));
