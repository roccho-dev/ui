import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SemanticDomainStore,
  classifySetBounds,
  classifySetBoundsNeighborhood,
  createSemanticMap,
  deriveSetSemantics,
  setIntersectionArea,
} from '../domain/index.js';
import {
  SET_TOPOLOGY_PROJECTION_PROFILES,
  compileTwoSetTopologyPresentation,
  interactionTargetFor,
  SemanticProjector,
  voronoiCells,
} from '../projection/index.js';
import { recoverSetTopologyOperation, translateSetTopologyOperation } from '../authoring/set-topology-bridge.js';

const records = [
  { type: 'meta', schema: 'semantic-map-state/1', root: 'root', title: 'Set semantics' },
  { type: 'region', id: 'root', parent: null, label: 'root', kind: 'root', bounds: [0, 0, 1000, 800], summary: '' },
  { type: 'region', id: 'a', parent: 'root', label: 'A', kind: 'set', bounds: [80, 80, 360, 300], summary: '', set: { complete: true } },
  { type: 'region', id: 'b', parent: 'root', label: 'B', kind: 'set', bounds: [300, 140, 360, 300], summary: '', set: { complete: true } },
  { type: 'region', id: 'x', parent: 'root', label: 'x', kind: 'item', bounds: [160, 180, 60, 50], summary: '' },
  { type: 'relation', id: 'member-x-a', from: 'x', to: 'a', kind: 'memberOf', label: '' },
  { type: 'relation', id: 'subset-a-b', from: 'a', to: 'b', kind: 'subsetOf', label: '' },
];
const domain = createSemanticMap(records);
const semantics = deriveSetSemantics(domain);
assert.equal(semantics.pairs.length, 1);
assert.equal(semantics.pairs[0].topology, 'subset');
assert.deepEqual(semantics.pairs[0].intersection, ['x']);
assert.deepEqual(semantics.sets.find((item) => item.id === 'b').members, ['x']);

const store = new SemanticDomainStore(domain);
store.perform({ type: 'SetSetCompleteness', regionId: 'a', complete: false });
assert.equal(store.domain.regions.get('a').set.complete, false);
assert.throws(() => createSemanticMap(records.map((record) => record.id === 'a' ? (({ set, ...rest }) => rest)(record) : record)), /set is required when kind is set/u);

const parent = { x: 0, y: 0, width: 500, height: 400 };
const sites = [
  { id: 'a', bounds: { x: 80, y: 80, width: 100, height: 80 } },
  { id: 'b', bounds: { x: 300, y: 210, width: 100, height: 80 } },
  { id: 'c', bounds: { x: 300, y: 210, width: 100, height: 80 } },
];
const terrainA = voronoiCells(parent, sites);
const terrainB = voronoiCells(parent, sites);
assert.deepEqual(terrainA, terrainB, 'terrain must be deterministic even for duplicate centers');
assert.equal(terrainA.length, 3);
for (const cell of terrainA) {
  assert.ok(cell.points.length >= 3);
  for (const point of cell.points) {
    assert.ok(point[0] >= parent.x && point[0] <= parent.x + parent.width);
    assert.ok(point[1] >= parent.y && point[1] <= parent.y + parent.height);
  }
}

const scene = new SemanticProjector(domain, null, { pattern: 'map/1' }).project({ scale: 1, viewport: { x: 0, y: 0, width: 1000, height: 800 } });
assert.ok(scene.setOverlay.sets.length >= 2);
assert.equal(scene.scenes[0].space, 'semantic-2d/1');

const unit = { x: 0, y: 0, width: 100, height: 100 };
assert.equal(classifySetBounds(unit, { x: 120, y: 0, width: 100, height: 100 }), 'disjoint');
assert.equal(classifySetBounds(unit, { x: 100, y: 0, width: 100, height: 100 }), 'disjoint', 'boundary contact has no set area');
assert.equal(classifySetBounds(unit, { x: 60, y: 10, width: 100, height: 100 }), 'partial-overlap');
assert.equal(classifySetBounds({ x: 20, y: 20, width: 30, height: 30 }, unit), 'subset');
assert.equal(classifySetBounds(unit, { x: 20, y: 20, width: 30, height: 30 }), 'superset');
assert.equal(classifySetBounds(unit, unit), 'equal');
assert.deepEqual(
  classifySetBoundsNeighborhood({ x: 100, y: 0, width: 100, height: 100 }, unit, { positionTolerance: 4 }).possible,
  ['disjoint', 'partial-overlap'],
);
assert.deepEqual(
  classifySetBoundsNeighborhood({ x: 99, y: 0, width: 100, height: 100 }, unit, { positionTolerance: 4 }).possible,
  ['disjoint', 'partial-overlap'],
);
assert.deepEqual(
  classifySetBoundsNeighborhood({ x: 90, y: 0, width: 100, height: 100 }, unit, { positionTolerance: 4 }).possible,
  ['partial-overlap'],
);

let neighborhoodOracleCases = 0;
for (const width of [24, 40, 64]) {
  for (const height of [20, 40, 60]) {
    for (const x of [-28, -4, 0, 20, 36, 40, 44, 68]) {
      for (const y of [-24, -4, 0, 20, 36, 40, 44, 64]) {
        const moving = { x, y, width, height };
        const fixed = { x: 0, y: 0, width: 40, height: 40 };
        const neighborhood = classifySetBoundsNeighborhood(moving, fixed, { positionTolerance: 4 });
        const sampled = new Set();
        for (let dx = -4; dx <= 4; dx += 1) {
          for (let dy = -4; dy <= 4; dy += 1) {
            sampled.add(classifySetBounds({ ...moving, x: moving.x + dx, y: moving.y + dy }, fixed, { epsilon: 0 }));
          }
        }
        for (const topology of sampled) {
          assert.ok(
            neighborhood.possible.includes(topology),
            `MUTATION:set-topology-neighborhood-completeness omitted ${topology}`,
          );
        }
        neighborhoodOracleCases += 1;
      }
    }
  }
}

const completeOverlapRecords = [
  { type: 'meta', schema: 'semantic-map-state/1', root: 'complete-root', title: 'Complete overlap' },
  { type: 'region', id: 'complete-root', parent: null, label: 'root', kind: 'root', bounds: [0, 0, 500, 300], summary: '' },
  { type: 'region', id: 'complete-a', parent: 'complete-root', label: 'A', kind: 'set', bounds: [40, 40, 180, 160], summary: '', set: { complete: true } },
  { type: 'region', id: 'complete-b', parent: 'complete-root', label: 'B', kind: 'set', bounds: [180, 40, 180, 160], summary: '', set: { complete: true } },
  { type: 'region', id: 'a-only', parent: 'complete-root', label: 'a', kind: 'node', bounds: [70, 90, 30, 30], summary: '' },
  { type: 'region', id: 'b-only', parent: 'complete-root', label: 'b', kind: 'node', bounds: [300, 90, 30, 30], summary: '' },
  { type: 'region', id: 'shared', parent: 'complete-root', label: 'shared', kind: 'node', bounds: [210, 90, 30, 30], summary: '' },
  { type: 'relation', id: 'a-member', from: 'a-only', to: 'complete-a', kind: 'memberOf', label: '' },
  { type: 'relation', id: 'b-member', from: 'b-only', to: 'complete-b', kind: 'memberOf', label: '' },
  { type: 'relation', id: 'shared-a', from: 'shared', to: 'complete-a', kind: 'memberOf', label: '' },
  { type: 'relation', id: 'shared-b', from: 'shared', to: 'complete-b', kind: 'memberOf', label: '' },
  { type: 'relation', id: 'complete-overlap', from: 'complete-a', to: 'complete-b', kind: 'overlapsWith', label: '' },
];
assert.equal(deriveSetSemantics(createSemanticMap(completeOverlapRecords)).pairs[0].topology, 'partial-overlap');
assert.throws(
  () => createSemanticMap(completeOverlapRecords.slice(0, -3).concat([
    { type: 'relation', id: 'complete-overlap', from: 'complete-a', to: 'complete-b', kind: 'overlapsWith', label: '' },
  ])),
  /complete overlapping sets require a shared member/,
);
assert.throws(
  () => createSemanticMap([
    { type: 'meta', schema: 'semantic-map-state/1', root: 'conflict-root', title: 'Conflict' },
    { type: 'region', id: 'conflict-root', parent: null, label: 'root', kind: 'root', bounds: [0, 0, 500, 300], summary: '' },
    { type: 'region', id: 'conflict-a', parent: 'conflict-root', label: 'A', kind: 'set', bounds: [40, 40, 180, 160], summary: '', set: { complete: false } },
    { type: 'region', id: 'conflict-b', parent: 'conflict-root', label: 'B', kind: 'set', bounds: [180, 40, 180, 160], summary: '', set: { complete: false } },
    { type: 'relation', id: 'conflict-overlap', from: 'conflict-a', to: 'conflict-b', kind: 'overlapsWith', label: '' },
    { type: 'relation', id: 'conflict-disjoint', from: 'conflict-a', to: 'conflict-b', kind: 'disjointWith', label: '' },
  ]),
  /both overlapping and disjoint/,
);
assert.throws(
  () => createSemanticMap(completeOverlapRecords.concat([
    { type: 'relation', id: 'bad-overlap-endpoint', from: 'shared', to: 'complete-a', kind: 'overlapsWith', label: '' },
  ])),
  /endpoints must be sets/,
);

const proofRecords = [
  { type: 'meta', schema: 'semantic-map-state/1', root: 'proof-root', title: 'Roundtrip' },
  { type: 'region', id: 'proof-root', parent: null, label: 'root', kind: 'root', bounds: [0, 0, 900, 600], summary: '' },
  { type: 'region', id: 'left', parent: 'proof-root', label: 'Left', kind: 'set', bounds: [120, 190, 260, 220], summary: '', set: { complete: false } },
  { type: 'region', id: 'right', parent: 'proof-root', label: 'Right', kind: 'set', bounds: [520, 190, 260, 220], summary: '', set: { complete: false } },
  { type: 'relation', id: 'set-topology.left.right.disjoint', from: 'left', to: 'right', kind: 'disjointWith', label: '' },
];
const proofDomain = createSemanticMap(proofRecords);
assert.deepEqual(SET_TOPOLOGY_PROJECTION_PROFILES, ['horizontal', 'vertical']);
assert.throws(
  () => compileTwoSetTopologyPresentation(proofDomain, { profile: 'diagonal' }),
  /unsupported projection profile diagonal/u,
);

const topologyProjectionSource = fs.readFileSync(
  new URL('../projection/set-topology-layout.js', import.meta.url),
  'utf8',
);
const topologyBridgeSource = fs.readFileSync(
  new URL('../authoring/set-topology-bridge.js', import.meta.url),
  'utf8',
);
assert.equal(
  /SemanticDomainStore|createSemanticMap/.test(topologyProjectionSource),
  false,
  'MUTATION:presentation-projection-must-not-clone-domain',
);
assert.equal(
  /scene\.setOverlay|scene\.representations/.test(topologyBridgeSource),
  false,
  'MUTATION:semantic-bridge-must-not-read-scene-internals',
);

function projectedSetProof(profile) {
  const presentationProjection = compileTwoSetTopologyPresentation(proofDomain, { profile });
  const scene = new SemanticProjector(
    proofDomain,
    null,
    { pattern: 'map/1' },
    { presentationProjection },
  ).project({
    scale: 1,
    viewport: { x: 0, y: 0, width: 900, height: 600 },
  });
  const left = scene.setOverlay.sets.find((item) => item.regionId === 'left');
  const right = scene.setOverlay.sets.find((item) => item.regionId === 'right');
  return { presentationProjection, scene, left, right };
}

const horizontalProof = projectedSetProof('horizontal');
const verticalProof = projectedSetProof('vertical');
assert.equal(setIntersectionArea(horizontalProof.left.bounds, horizontalProof.right.bounds), 0);
assert.equal(setIntersectionArea(verticalProof.left.bounds, verticalProof.right.bounds), 0);
assert.ok(
  Math.abs(horizontalProof.left.bounds.x - horizontalProof.right.bounds.x)
    > Math.abs(horizontalProof.left.bounds.y - horizontalProof.right.bounds.y),
  'horizontal profile must express the pair primarily on the x axis',
);
assert.ok(
  Math.abs(verticalProof.left.bounds.y - verticalProof.right.bounds.y)
    > Math.abs(verticalProof.left.bounds.x - verticalProof.right.bounds.x),
  'MUTATION:set-topology-projection-profile vertical profile must express the pair primarily on the y axis',
);
assert.equal(proofDomain.regions.get('right').bounds.x, 520, 'projection must not mutate source geometry');
assert.equal(horizontalProof.presentationProjection.schema, 'semantic-presentation-projection/1');
assert.equal(horizontalProof.presentationProjection.id, 'set-topology/horizontal/1');
assert.equal(horizontalProof.presentationProjection.pattern, 'map/1');
assert.equal(verticalProof.presentationProjection.id, 'set-topology/vertical/1');
assert.deepEqual(
  horizontalProof.presentationProjection.interactions.map((item) => [item.regionId, item.role, item.editKinds]),
  [['left', 'set', ['set-topology']], ['right', 'set', ['set-topology']]],
);
assert.equal('regions' in horizontalProof.presentationProjection, false);
assert.equal('relations' in horizontalProof.presentationProjection, false);
assert.deepEqual(deriveSetSemantics(proofDomain), deriveSetSemantics(proofDomain));

function overlapGesture(proof) {
  return {
    type: 'MoveRegions',
    regionIds: ['right'],
    dx: proof.left.bounds.x + proof.left.bounds.width * 0.18 - proof.right.bounds.x,
    dy: proof.left.bounds.y + proof.left.bounds.height * 0.18 - proof.right.bounds.y,
  };
}

const recoveredHorizontal = translateSetTopologyOperation(
  overlapGesture(horizontalProof),
  { domain: proofDomain, presentationProjection: horizontalProof.presentationProjection, view: { pattern: 'map/1' } },
);
const recoveredVertical = translateSetTopologyOperation(
  overlapGesture(verticalProof),
  { domain: proofDomain, presentationProjection: verticalProof.presentationProjection, view: { pattern: 'map/1' } },
);
assert.equal(recoveredHorizontal.status, 'candidate');
assert.equal(recoveredVertical.status, 'candidate');
assert.deepEqual(
  recoveredHorizontal.operations,
  recoveredVertical.operations,
  'MUTATION:set-topology-semantic-bridge projection profiles must produce the same semantic protocol operation',
);
const translated = recoveredHorizontal.operations;
assert.deepEqual(
  translated.map((operation) => operation.type),
  ['RemoveSelection', 'ConnectRegions'],
  'MUTATION:set-topology-semantic-bridge',
);
assert.equal(translated.some((operation) => operation.type === 'MoveRegions'), false);
assert.equal(translated[1].kind, 'overlapsWith');

function contactGesture(proof, overlap) {
  return {
    type: 'MoveRegions',
    regionIds: ['right'],
    dx: proof.left.bounds.x + proof.left.bounds.width - overlap - proof.right.bounds.x,
    dy: proof.left.bounds.y - proof.right.bounds.y,
  };
}
const stablePresentation = recoverSetTopologyOperation(
  { type: 'MoveRegions', regionIds: ['right'], dx: -8, dy: 0 },
  { domain: proofDomain, presentationProjection: horizontalProof.presentationProjection, view: { pattern: 'map/1' } },
);
assert.equal(stablePresentation.status, 'presentation');
assert.deepEqual(stablePresentation.possibleMeanings, ['disjoint']);
const contactReview = recoverSetTopologyOperation(
  contactGesture(horizontalProof, 0),
  { domain: proofDomain, presentationProjection: horizontalProof.presentationProjection, view: { pattern: 'map/1' } },
);
assert.equal(contactReview.status, 'review', 'MUTATION:set-topology-robustness-neighborhood');
assert.deepEqual(contactReview.possibleMeanings, ['disjoint', 'partial-overlap']);
assert.deepEqual(contactReview.candidateMeanings, ['partial-overlap']);
assert.deepEqual(contactReview.operations, []);
const microOverlapReview = recoverSetTopologyOperation(
  contactGesture(horizontalProof, 1),
  { domain: proofDomain, presentationProjection: horizontalProof.presentationProjection, view: { pattern: 'map/1' } },
);
assert.equal(microOverlapReview.status, 'review');
assert.deepEqual(microOverlapReview.possibleMeanings, ['disjoint', 'partial-overlap']);
const zoomedStableOverlap = recoverSetTopologyOperation(
  contactGesture(horizontalProof, 3),
  {
    domain: proofDomain,
    presentationProjection: horizontalProof.presentationProjection,
    presentationScale: 2,
    view: { pattern: 'map/1' },
  },
);
assert.equal(
  zoomedStableOverlap.status,
  'candidate',
  'MUTATION:set-topology-screen-tolerance screen-stable tolerance must account for zoom',
);
const zoomedMicroOverlap = recoverSetTopologyOperation(
  contactGesture(horizontalProof, 3),
  {
    domain: proofDomain,
    presentationProjection: horizontalProof.presentationProjection,
    presentationScale: 0.5,
    view: { pattern: 'map/1' },
  },
);
assert.equal(zoomedMicroOverlap.status, 'review');
assert.equal(zoomedStableOverlap.evidence.screenTolerance, 4);
assert.equal(zoomedStableOverlap.evidence.positionTolerance, 2);
assert.equal(zoomedMicroOverlap.evidence.positionTolerance, 8);

const stableOverlapCandidate = recoverSetTopologyOperation(
  contactGesture(horizontalProof, 12),
  { domain: proofDomain, presentationProjection: horizontalProof.presentationProjection, view: { pattern: 'map/1' } },
);
assert.equal(stableOverlapCandidate.status, 'candidate');
assert.deepEqual(stableOverlapCandidate.possibleMeanings, ['partial-overlap']);
assert.equal(
  recoverSetTopologyOperation(
    { type: 'MoveRegions', regionIds: ['left', 'right'], dx: 1, dy: 0 },
    { domain: proofDomain, presentationProjection: horizontalProof.presentationProjection, view: { pattern: 'map/1' } },
  ).status,
  'reject',
);
const proofStore = new SemanticDomainStore(proofDomain);
proofStore.performBatch(translated);
assert.equal(deriveSetSemantics(proofStore.domain).pairs[0].topology, 'partial-overlap');
assert.equal(proofStore.domain.regions.get('right').bounds.x, 520, 'semantic edit must not persist dragged coordinates');
function projectedBounds(projection, regionId) {
  return projection.layout.find((item) => item.regionId === regionId).bounds;
}
const recompiledProof = compileTwoSetTopologyPresentation(proofStore.domain);
assert.ok(
  setIntersectionArea(projectedBounds(recompiledProof, 'left'), projectedBounds(recompiledProof, 'right')) > 0,
  'MUTATION:set-topology-recompile',
);
const recompiledVerticalProof = compileTwoSetTopologyPresentation(proofStore.domain, { profile: 'vertical' });
assert.ok(
  setIntersectionArea(
    projectedBounds(recompiledVerticalProof, 'left'),
    projectedBounds(recompiledVerticalProof, 'right'),
  ) > 0,
);
assert.notDeepEqual(
  projectedBounds(recompiledProof, 'right'),
  projectedBounds(recompiledVerticalProof, 'right'),
  'same semantic State must allow different deterministic projections',
);
assert.equal(proofStore.domain.regions.get('right').bounds.x, 520, 'recompile must not create a projected domain clone');

function twoSetFixture({
  leftId,
  rightId,
  leftBounds,
  rightBounds,
  relationKind = 'disjointWith',
  relationFrom = leftId,
  relationTo = rightId,
}) {
  return createSemanticMap([
    { type: 'meta', schema: 'semantic-map-state/1', root: 'matrix-root', title: 'Meaning recovery matrix' },
    { type: 'region', id: 'matrix-root', parent: null, label: 'root', kind: 'root', bounds: [0, 0, 1000, 700], summary: '' },
    { type: 'region', id: leftId, parent: 'matrix-root', label: leftId, kind: 'set', bounds: leftBounds, summary: '', set: { complete: false } },
    { type: 'region', id: rightId, parent: 'matrix-root', label: rightId, kind: 'set', bounds: rightBounds, summary: '', set: { complete: false } },
    { type: 'relation', id: 'matrix-relation', from: relationFrom, to: relationTo, kind: relationKind, label: '' },
  ]);
}

function recoverAt(domainInput, movedId, desiredBounds, profile = 'horizontal') {
  const presentationProjection = compileTwoSetTopologyPresentation(domainInput, { profile });
  assert.ok(presentationProjection, 'fixture must compile to a presentation projection');
  const target = presentationProjection.interactions.find((item) => item.regionId === movedId);
  assert.ok(target, `interaction target missing for ${movedId}`);
  return recoverSetTopologyOperation(
    {
      type: 'MoveRegions',
      regionIds: [movedId],
      dx: desiredBounds.x - target.bounds.x,
      dy: desiredBounds.y - target.bounds.y,
    },
    { domain: domainInput, presentationProjection, view: { pattern: 'map/1' } },
  );
}

const sizeMatrixDomain = twoSetFixture({
  leftId: 'a-small',
  rightId: 'z-large',
  leftBounds: [80, 80, 140, 100],
  rightBounds: [500, 80, 300, 240],
});
const sizeMatrixProjection = compileTwoSetTopologyPresentation(sizeMatrixDomain);
const smallTarget = interactionTargetFor(sizeMatrixProjection, 'a-small', 'set-topology');
const largeTarget = interactionTargetFor(sizeMatrixProjection, 'z-large', 'set-topology');
assert.ok(smallTarget && largeTarget);
const subsetCandidate = recoverAt(sizeMatrixDomain, 'a-small', {
  ...smallTarget.bounds,
  x: largeTarget.bounds.x + 30,
  y: largeTarget.bounds.y + 30,
});
assert.equal(subsetCandidate.status, 'candidate');
assert.deepEqual(subsetCandidate.possibleMeanings, ['subset']);
assert.equal(subsetCandidate.operations.at(-1).kind, 'subsetOf');
assert.equal(subsetCandidate.operations.at(-1).from, 'a-small');
assert.equal(subsetCandidate.operations.at(-1).to, 'z-large');

const supersetCandidate = recoverAt(sizeMatrixDomain, 'z-large', {
  ...largeTarget.bounds,
  x: smallTarget.bounds.x - 30,
  y: smallTarget.bounds.y - 30,
});
assert.equal(
  supersetCandidate.status,
  'candidate',
  'MUTATION:set-topology-moved-orientation moved-set topology must be orientation independent',
);
assert.deepEqual(supersetCandidate.possibleMeanings, ['superset']);
assert.equal(supersetCandidate.operations.at(-1).kind, 'subsetOf');
assert.equal(supersetCandidate.operations.at(-1).from, 'a-small');
assert.equal(supersetCandidate.operations.at(-1).to, 'z-large');

const matrixOverlapCandidate = recoverAt(sizeMatrixDomain, 'z-large', {
  ...largeTarget.bounds,
  x: smallTarget.bounds.x + smallTarget.bounds.width - 30,
  y: smallTarget.bounds.y,
});
assert.equal(matrixOverlapCandidate.status, 'candidate');
assert.deepEqual(matrixOverlapCandidate.possibleMeanings, ['partial-overlap']);

const equalSizeDomain = twoSetFixture({
  leftId: 'equal-a',
  rightId: 'equal-b',
  leftBounds: [80, 80, 180, 140],
  rightBounds: [500, 80, 180, 140],
});
const equalProjection = compileTwoSetTopologyPresentation(equalSizeDomain);
const equalATarget = interactionTargetFor(equalProjection, 'equal-a', 'set-topology');
const equalReview = recoverAt(equalSizeDomain, 'equal-b', equalATarget.bounds);
assert.equal(equalReview.status, 'review');
assert.deepEqual(equalReview.possibleMeanings, ['partial-overlap', 'equal']);
assert.deepEqual(equalReview.candidateMeanings, ['partial-overlap', 'equal']);

const overlapDomain = twoSetFixture({
  leftId: 'overlap-a',
  rightId: 'overlap-b',
  leftBounds: [80, 80, 180, 140],
  rightBounds: [200, 80, 180, 140],
  relationKind: 'overlapsWith',
});
const overlapProjection = compileTwoSetTopologyPresentation(overlapDomain);
const overlapATarget = interactionTargetFor(overlapProjection, 'overlap-a', 'set-topology');
const overlapBTarget = interactionTargetFor(overlapProjection, 'overlap-b', 'set-topology');
const disjointCandidate = recoverAt(overlapDomain, 'overlap-b', {
  ...overlapBTarget.bounds,
  x: overlapATarget.bounds.x + overlapATarget.bounds.width + 24,
  y: overlapATarget.bounds.y,
});
assert.equal(disjointCandidate.status, 'candidate');
assert.deepEqual(disjointCandidate.possibleMeanings, ['disjoint']);
assert.equal(disjointCandidate.operations.at(-1).kind, 'disjointWith');

const subsetDomain = twoSetFixture({
  leftId: 'subset-small',
  rightId: 'subset-large',
  leftBounds: [120, 120, 120, 90],
  rightBounds: [80, 80, 300, 240],
  relationKind: 'subsetOf',
  relationFrom: 'subset-small',
  relationTo: 'subset-large',
});
const subsetProjection = compileTwoSetTopologyPresentation(subsetDomain);
const subsetSmallTarget = interactionTargetFor(subsetProjection, 'subset-small', 'set-topology');
const subsetPresentation = recoverAt(subsetDomain, 'subset-small', {
  ...subsetSmallTarget.bounds,
  x: subsetSmallTarget.bounds.x + 8,
  y: subsetSmallTarget.bounds.y + 8,
});
assert.equal(subsetPresentation.status, 'presentation');
assert.deepEqual(subsetPresentation.possibleMeanings, ['subset']);

assert.deepEqual(
  classifySetBoundsNeighborhood(
    { x: 10, y: 10, width: 30, height: 30 },
    { x: 0, y: 0, width: 100, height: 100 },
    { positionTolerance: 4 },
  ).possible,
  ['subset'],
);
assert.deepEqual(
  classifySetBoundsNeighborhood(
    { x: 0, y: 10, width: 30, height: 30 },
    { x: 0, y: 0, width: 100, height: 100 },
    { positionTolerance: 4 },
  ).possible,
  ['partial-overlap', 'subset'],
);
assert.deepEqual(
  classifySetBoundsNeighborhood(unit, unit, { positionTolerance: 4 }).possible,
  ['partial-overlap', 'equal'],
);

const completeDisjointDomain = createSemanticMap([
  { type: 'meta', schema: 'semantic-map-state/1', root: 'complete-proof-root', title: 'Complete disjoint proof' },
  { type: 'region', id: 'complete-proof-root', parent: null, label: 'root', kind: 'root', bounds: [0, 0, 900, 600], summary: '' },
  { type: 'region', id: 'complete-left', parent: 'complete-proof-root', label: 'Left', kind: 'set', bounds: [120, 190, 260, 220], summary: '', set: { complete: true } },
  { type: 'region', id: 'complete-right', parent: 'complete-proof-root', label: 'Right', kind: 'set', bounds: [520, 190, 260, 220], summary: '', set: { complete: true } },
  { type: 'relation', id: 'complete-disjoint', from: 'complete-left', to: 'complete-right', kind: 'disjointWith', label: '' },
]);
const completeProjection = compileTwoSetTopologyPresentation(completeDisjointDomain);
const completeLeft = { bounds: completeProjection.layout.find((item) => item.regionId === 'complete-left').bounds };
const completeRight = { bounds: completeProjection.layout.find((item) => item.regionId === 'complete-right').bounds };
const completeRejected = recoverSetTopologyOperation(
  {
    type: 'MoveRegions',
    regionIds: ['complete-right'],
    dx: completeLeft.bounds.x + completeLeft.bounds.width - 12 - completeRight.bounds.x,
    dy: completeLeft.bounds.y - completeRight.bounds.y,
  },
  { domain: completeDisjointDomain, presentationProjection: completeProjection, view: { pattern: 'map/1' } },
);
assert.equal(completeRejected.status, 'reject', 'MUTATION:set-topology-semantic-invariant');
assert.equal(completeRejected.reason, 'meaning-unrepresentable');
assert.deepEqual(completeRejected.unsupportedMeanings, ['partial-overlap']);

console.log(JSON.stringify({
  schema: 'semantic-map-map-semantics-test/3',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  topology: semantics.pairs[0].topology,
  deterministicTerrain: true,
  terrainCells: terrainA.length,
  explicitCompleteness: true,
  setTopologyRoundtrip: true,
  protocolProjectionDecoupled: true,
  presentationLayoutOverlay: true,
  interactionProjectionBoundary: true,
  sceneIndependentSemanticBridge: true,
  projectionProfiles: SET_TOPOLOGY_PROJECTION_PROFILES,
  semanticOperations: translated.map((operation) => operation.type),
  meaningRecoveryOutcomes: ['presentation', 'candidate', 'review', 'reject'],
  topologyRecoveryMatrix: {
    disjoint: 'candidate',
    partialOverlap: 'candidate',
    subset: 'candidate',
    superset: 'candidate',
    equal: 'review',
    boundaryContact: 'review',
    microOverlap: 'review',
    stableSameMeaning: 'presentation',
    semanticInvariantConflict: 'reject',
  },
  screenTolerancePx: 4,
  zoomNormalizedTolerance: true,
  neighborhoodOracleCases,
}));
