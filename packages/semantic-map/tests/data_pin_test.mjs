import assert from 'node:assert/strict';
import fs from 'node:fs';
import { splitDataPinRecords } from '../../data-pin/contract.mjs';
import {
  SemanticDomainStore,
  createSemanticMap,
  parseSemanticMapRecords,
} from '../domain/index.js';
import { splitStateRecords } from '../layout/state.js';
import {
  appendDecision,
  createDecision,
  createDecisionLog,
  createEnvelope,
  defaultViewForPattern,
  inspectEnvelope,
} from '../protocol/index.js';
import { parseStateJSONL, stateRecordsToJSONL } from '../protocol/input-jsonl.js';
import { stateHash } from '../protocol/state-hash.js';

const text = fs.readFileSync(new URL('../examples/graph/flow.jsonl', import.meta.url), 'utf8');
const semanticSourceRecords = parseSemanticMapRecords(text);
const domain = createSemanticMap(semanticSourceRecords);
const store = new SemanticDomainStore(domain);
const review = domain.regions.get('review');
const bounds = [review.bounds.x, review.bounds.y, review.bounds.width, review.bounds.height];

store.perform({
  type: 'PinData',
  items: [{ targetId: 'review', basis: 'premise', reason: 'review is an agreed premise' }],
});
assert.deepEqual(store.dataPinSnapshot(), [{
  type: 'data-pin',
  targetId: 'review',
  basis: 'premise',
  reason: 'review is an agreed premise',
}]);

const beforeLabel = store.domain.regions.get('review').label;
assert.throws(
  () => store.perform({ type: 'RenameRegion', regionId: 'review', label: 'changed' }),
  /mutation blocked by review \(premise: review is an agreed premise\)/u,
);
assert.equal(store.domain.regions.get('review').label, beforeLabel, 'rejected mutation must roll back');

store.perform({ type: 'PinRegions', items: [{ regionId: 'review', bounds }] });
assert.equal(store.layoutSnapshot().length, 1, 'layout pin remains independent from data pin');

const pinnedJsonl = stateRecordsToJSONL(store.toRecords());
assert.match(pinnedJsonl, /"type":"data-pin"/u);
assert.match(pinnedJsonl, /"type":"layout"/u);
const replay = parseStateJSONL(pinnedJsonl);
const { dataRecords, dataPinRecords } = splitDataPinRecords(replay);
const { semanticRecords, layoutRecords } = splitStateRecords(dataRecords);
assert.equal(dataPinRecords.length, 1);
assert.equal(layoutRecords.length, 1);
assert.equal(createSemanticMap(semanticRecords).regions.get('review').label, beforeLabel);
assert.notEqual(await stateHash(parseStateJSONL(text)), await stateHash(replay), 'data pin must participate in the state hash');

const initialLog = await createDecisionLog(semanticSourceRecords, 'urn:test:data-pin-envelope');
const pinnedDecision = await createDecision(initialLog.head, [{
  type: 'PinData',
  items: [{ targetId: 'review', basis: 'premise', reason: 'review is an agreed premise' }],
}], initialLog.records);
const appended = await appendDecision(initialLog.log, pinnedDecision.decision);
const envelope = await createEnvelope(appended.log, null, defaultViewForPattern('graph/1'));
const inspected = await inspectEnvelope(envelope);
assert.equal(splitDataPinRecords(inspected.base.records).dataPinRecords.length, 1, 'Envelope must preserve data pin state while semantic validation ignores the sidecar');

store.performBatch([
  { type: 'UnpinData', targetIds: ['review'] },
  { type: 'RenameRegion', regionId: 'review', label: 'changed after explicit unpin' },
]);
assert.equal(store.dataPinSnapshot().length, 0);
assert.equal(store.domain.regions.get('review').label, 'changed after explicit unpin');

const atomic = new SemanticDomainStore(domain);
assert.throws(() => atomic.performBatch([
  { type: 'PinData', items: [{ targetId: 'review', basis: 'dependency', reason: 'downstream depends on this' }] },
  { type: 'RenameRegion', regionId: 'review', label: 'must not commit' },
]), /mutation blocked/u);
assert.equal(atomic.dataPinSnapshot().length, 0, 'failed batch must roll back the new pin');
assert.equal(atomic.domain.regions.get('review').label, beforeLabel, 'failed batch must roll back semantic data');

console.log(JSON.stringify({
  schema: 'semantic-map-data-pin-test/1',
  status: 'PASS',
  jsonlRoundtrip: true,
  envelopeRoundtrip: true,
  mutationRejected: true,
  explicitUnpinRequired: true,
  layoutIndependent: true,
  atomicRollback: true,
}));
