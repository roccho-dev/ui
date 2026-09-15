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

console.log(JSON.stringify({
  schema: 'semantic-map-layout-hint-test/1',
  status: 'PASS',
  pin: 'hard',
  roundtrip: true,
  autoLayoutPreserved: true,
}));
