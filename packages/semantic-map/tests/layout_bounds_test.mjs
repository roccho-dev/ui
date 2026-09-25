import assert from 'node:assert/strict';
import { LAYOUT_BOUNDS_SCHEMA, layoutBoundsFor } from '../protocol/index.js';
import { createGraphLayout } from '../pattern/index.js';
import { createSemanticMap } from '../domain/index.js';

// The public read-only layout contract: where a view places regions, so a
// consumer can put something beside what is already there without importing
// the layout code or copying its sizing constants.

const node = (id, x) => ({
  type: 'region', id, parent: 'root', label: id, kind: 'node', bounds: [x, 90, 140, 64], summary: '',
});
const SEMANTIC = Object.freeze([
  { type: 'meta', schema: 'semantic-map-state/1', root: 'root', title: 'layout bounds' },
  { type: 'region', id: 'root', parent: null, label: 'layout bounds', kind: 'boundary', bounds: [0, 0, 720, 260], summary: '' },
  node('node-a', 40), node('node-b', 250), node('node-c', 460),
  { type: 'relation', id: 'r-a-b', from: 'node-a', to: 'node-b', kind: 'flow', label: '' },
]);
const pin = (regionId, bounds) => ({ type: 'layout', regionId, pin: 'hard', bounds });
const view = { pattern: 'graph/1' };
const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

// 1. Shape, and the promise that reading changes nothing.
const plain = layoutBoundsFor([...SEMANTIC], view);
assert.deepEqual(Object.keys(plain).sort(), ['bounds', 'pattern', 'pinned', 'rootBounds', 'schema']);
assert.equal(plain.schema, LAYOUT_BOUNDS_SCHEMA);
assert.equal(plain.pattern, 'graph/1');
assert.ok(Object.isFrozen(plain) && Object.isFrozen(plain.bounds) && Object.isFrozen(plain.pinned));
assert.deepEqual(plain.pinned, [], 'nothing is pinned in this state');
for (const [regionId, value] of Object.entries(plain.bounds)) {
  assert.equal(value.length, 4, regionId);
  assert.ok(value.every(Number.isFinite), regionId);
}

const input = deepFreeze([...SEMANTIC]);
const again = layoutBoundsFor(input, view);
assert.deepEqual(again, plain, 'the same state must give the same answer');
assert.deepEqual(input, SEMANTIC, 'reading must not touch the records it was given');

// 2. Without pins it is the view's own automatic layout, exactly.
const automatic = createGraphLayout(createSemanticMap(SEMANTIC));
for (const [regionId, value] of automatic.bounds) {
  assert.deepEqual(plain.bounds[regionId], [value.x, value.y, value.width, value.height], regionId);
}
assert.deepEqual(plain.rootBounds, plain.bounds.root);

// 3. A pinned region reports the bounds its pin fixed; the others keep their
// automatic ones. This is the case a consumer needs for an anchor that has
// already been placed: it must be told where the part is now, not where the
// view would have put it.
const INSIDE = [200, 150, 140, 64];
const insidePin = layoutBoundsFor([...SEMANTIC, pin('node-c', INSIDE)], view);
assert.deepEqual(insidePin.bounds['node-c'], INSIDE);
assert.notDeepEqual(insidePin.bounds['node-c'], plain.bounds['node-c'], 'that is not the automatic position');
assert.deepEqual(insidePin.pinned, ['node-c']);
for (const regionId of ['node-a', 'node-b']) {
  assert.deepEqual(insidePin.bounds[regionId], plain.bounds[regionId], `${regionId} keeps automatic layout`);
}

// 4. The enclosing boundary grows only when a pin needs the room.
//    Negative: a pin already inside leaves it alone.
assert.deepEqual(insidePin.rootBounds, plain.rootBounds, 'a pin that fits must not resize the boundary');

//    Positive: a pin past the far edge widens it.
const OUTSIDE = [1200, 700, 140, 64];
const outsidePin = layoutBoundsFor([...SEMANTIC, pin('node-c', OUTSIDE)], view);
assert.deepEqual(outsidePin.bounds['node-c'], OUTSIDE);
const [, , rootWidth, rootHeight] = plain.rootBounds;
assert.ok(outsidePin.rootBounds[2] > rootWidth && outsidePin.rootBounds[3] > rootHeight,
  `the boundary must grow to hold ${OUTSIDE}, got ${JSON.stringify(outsidePin.rootBounds)}`);
assert.ok(outsidePin.rootBounds[0] + outsidePin.rootBounds[2] >= OUTSIDE[0] + OUTSIDE[2]);

//    Positive at the other end: a pin at a negative origin moves it back.
const NEGATIVE = [-400, -300, 140, 64];
const negativePin = layoutBoundsFor([...SEMANTIC, pin('node-c', NEGATIVE)], view);
assert.deepEqual(negativePin.bounds['node-c'], NEGATIVE);
assert.ok(negativePin.rootBounds[0] <= NEGATIVE[0] && negativePin.rootBounds[1] <= NEGATIVE[1],
  `the boundary must reach ${NEGATIVE}, got ${JSON.stringify(negativePin.rootBounds)}`);

// 5. `pinned` never names a region `bounds` does not hold. An item kind is
// drawn as a row inside its parent's label, so the view places no box for it -
// and a pin on it is not a position either.
const field = { type: 'region', id: 'field-1', parent: 'node-a', label: 'field-1', kind: 'field', bounds: [10, 10, 140, 64], summary: '' };
const withItem = [
  ...SEMANTIC.filter(record => record.type !== 'relation'),
  field,
  ...SEMANTIC.filter(record => record.type === 'relation'),
];
const itemPinned = layoutBoundsFor([...withItem, pin('field-1', [900, 900, 140, 64])], view);
assert.equal(Object.hasOwn(itemPinned.bounds, 'field-1'), false, 'the view places no box for an item kind');
assert.deepEqual(itemPinned.pinned, [], 'pinned must stay a subset of bounds');
for (const regionId of itemPinned.pinned) assert.ok(Object.hasOwn(itemPinned.bounds, regionId), regionId);

// 6. What it refuses, rather than guessing.
assert.throws(() => layoutBoundsFor([], view), /non-empty array/u);
assert.throws(() => layoutBoundsFor(SEMANTIC, { pattern: 'map/1' }), /only graph\/1 reports layout bounds/u);
assert.throws(() => layoutBoundsFor(SEMANTIC, { pattern: 'seq/1' }), /View\.seq is required|only graph\/1/u);
assert.throws(() => layoutBoundsFor(SEMANTIC, {}), /View\.pattern is required/u);
assert.throws(() => layoutBoundsFor([...SEMANTIC, pin('missing', INSIDE)], view), /layout region not found/u);
assert.throws(() => layoutBoundsFor([...SEMANTIC, pin('root', INSIDE)], view), /root region cannot be pinned/u);

console.log(JSON.stringify({
  schema: 'semantic-map-layout-bounds-test/1',
  status: 'PASS',
  regions: Object.keys(plain.bounds).length,
  automaticMatchesView: true,
  pinnedReportsStoredBounds: true,
  rootGrowsOnlyWhenNeeded: true,
  negativeOriginHandled: true,
  pinnedSubsetOfBounds: true,
  preCulling: 'bounds are view-space layout positions, not proof of visibility',
}));
