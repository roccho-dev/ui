import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SemanticDomainStore,
  createSemanticMap,
  parseSemanticMapRecords,
} from '../domain/index.js';
import { layoutMap, normalizeLayoutRecords, splitStateRecords } from '../layout/state.js';
import { createGraphLayout } from '../pattern/index.js';
import { parseStateJSONL, stateRecordsToJSONL } from '../protocol/input-jsonl.js';

const text = fs.readFileSync(new URL('../examples/graph/flow.jsonl', import.meta.url), 'utf8');
const domain = createSemanticMap(parseSemanticMapRecords(text));
const automatic = createGraphLayout(domain, { direction: 'LR' });
const review = automatic.bounds.get('review');
const preferred = Object.freeze([
  review.x + 137,
  review.y + 83,
  review.width,
  review.height,
]);

const store = new SemanticDomainStore(domain);
store.perform({
  type: 'PinRegions',
  items: [{ regionId: 'review', bounds: preferred }],
});
assert.equal(store.layoutSnapshot().length, 1);
assert.deepEqual(store.layoutSnapshot()[0], {
  type: 'layout',
  regionId: 'review',
  pin: 'hard',
  bounds: preferred,
});
assert.equal(store.draftSnapshot().operations[0].type, 'PinRegions');

const jsonl = stateRecordsToJSONL(store.toRecords());
assert.match(jsonl, /"type":"layout"/u);
const replayRecords = parseStateJSONL(jsonl);
const { semanticRecords, layoutRecords } = splitStateRecords(replayRecords);
const replayDomain = createSemanticMap(semanticRecords);
const replayLayout = normalizeLayoutRecords(layoutRecords, replayDomain);
const replayed = createGraphLayout(replayDomain, {
  direction: 'LR',
  pins: layoutMap(replayLayout, replayDomain),
});
assert.deepEqual(replayed.bounds.get('review'), {
  x: preferred[0],
  y: preferred[1],
  width: preferred[2],
  height: preferred[3],
});
assert.deepEqual(
  replayed.bounds.get('start'),
  automatic.bounds.get('start'),
  'pinning one node must not disable automatic placement for untouched nodes',
);

assert.equal(store.undo(), true);
assert.equal(store.layoutSnapshot().length, 0, 'undo must remove the pin');
assert.equal(store.redo(), true);
assert.equal(store.layoutSnapshot().length, 1, 'redo must restore the pin');
store.perform({ type: 'UnpinRegions', regionIds: ['review'] });
assert.equal(store.layoutSnapshot().length, 0, 'unpin must return the node to automatic layout');
const unpinned = createGraphLayout(store.domain, { direction: 'LR', pins: store.layoutHints });
assert.deepEqual(unpinned.bounds.get('review'), automatic.bounds.get('review'));

assert.throws(
  () => store.perform({ type: 'PinRegions', items: [{ regionId: domain.meta.root, bounds: preferred }] }),
  /root region cannot be pinned/u,
);
assert.throws(
  () => parseStateJSONL(`${text}{"type":"layout","regionId":"missing","pin":"hard","bounds":[0,0,180,92]}\n`),
  /layout region not found/u,
);

// What the public embed entry has to do with a canonical state that carries
// layout records: build the domain from the semantic records alone, because
// createSemanticMap accepts only meta, region and relation, and keep the
// layout records for the view that can honour them. Handing the whole state
// straight to createSemanticMap is what made the embed fail with "unknown
// record type".
const pinnedState = `${text}{"type":"layout","regionId":"review","pin":"hard","bounds":[600,400,140,64]}\n`;
const pinnedRecords = parseStateJSONL(pinnedState);

assert.throws(
  () => createSemanticMap(pinnedRecords),
  /unknown record type/u,
  'the domain refuses layout records, so the entry must split them out first',
);

const split = splitStateRecords(pinnedRecords);
const embedDomain = createSemanticMap(split.semanticRecords);
assert.equal(split.layoutRecords.length, 1);
assert.ok(embedDomain.regions.has('review'));

// The pins that state carries must reach the layout, and only the pinned
// region may move: everything else keeps the position it had without pins.
const embedPins = layoutMap(split.layoutRecords, embedDomain);
const pinnedLayout = createGraphLayout(embedDomain, { direction: 'LR', pins: embedPins });
assert.deepEqual(
  pinnedLayout.bounds.get('review'),
  { x: 600, y: 400, width: 140, height: 64 },
  'a pinned region is placed at its stored bounds',
);
assert.notDeepEqual(
  pinnedLayout.bounds.get('review'),
  automatic.bounds.get('review'),
  'and that is not where automatic layout put it',
);
for (const [regionId, bounds] of automatic.bounds) {
  if (regionId === 'review' || regionId === domain.meta.root) continue;
  assert.deepEqual(pinnedLayout.bounds.get(regionId), bounds, `${regionId} must keep its automatic layout`);
}

// The projector refuses a layout entry for a region its plan does not hold,
// so the entry may only offer entries the plan can place.
assert.ok(
  [...pinnedLayout.bounds.keys()].every(regionId => createGraphLayout(embedDomain, { direction: 'LR' }).bounds.has(regionId)),
  'pinned layout must not invent regions the plain plan does not place',
);

console.log(JSON.stringify({
  schema: 'semantic-map-layout-hint-test/2',
  status: 'PASS',
  pin: 'hard',
  roundtrip: true,
  autoLayoutPreserved: true,
  embedSplit: true,
  embedPinnedBounds: [600, 400, 140, 64],
}));
