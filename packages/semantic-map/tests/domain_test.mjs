import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  OPERATION_TYPES,
  STATE_SCHEMA,
  SemanticDomainStore,
  createSemanticMap,
  parseSemanticMapRecords,
  recordsToJSONL,
} from '../domain/index.js';

const text = fs.readFileSync(new URL('../examples/example.jsonl', import.meta.url), 'utf8');
const records = parseSemanticMapRecords(text);
const domain = createSemanticMap(records);
assert.equal(domain.meta.schema, STATE_SCHEMA);
assert.equal(domain.meta.root, 'map');
assert.ok(domain.regions.size >= 10);
assert.ok(OPERATION_TYPES.includes('PlaceTemporalRegions'));
assert.ok(!OPERATION_TYPES.includes('SetRegionTemporal'));

const store = new SemanticDomainStore(domain);
const accepted = store.toJSONL();
store.perform({ type: 'RenameRegion', regionId: 'request', label: 'Request renamed' });
assert.equal(store.domain.regions.get('request').label, 'Request renamed');
assert.equal(store.draftSnapshot().applied, 1);
assert.equal(store.undo(), true);
assert.equal(store.domain.regions.get('request').label, '1 依頼');
assert.equal(store.redo(), true);
assert.equal(store.domain.regions.get('request').label, 'Request renamed');

const beforeTemporal = structuredClone(store.domain.regions.get('capture').temporal);
store.perform({
  type: 'PlaceTemporalRegions',
  axis: 'ordinal',
  items: [{ regionId: 'capture', actor: 'ai', start: 9, end: 11 }],
});
const afterTemporal = store.domain.regions.get('capture').temporal;
assert.deepEqual(afterTemporal.ordinal, { start: 9, end: 11 });
assert.deepEqual(afterTemporal.calendar, beforeTemporal.calendar, 'inactive calendar axis must survive');
assert.equal(afterTemporal.actor, 'ai');

const beforeBatch = store.toJSONL();
assert.throws(() => store.performBatch([
  { type: 'RenameRegion', regionId: 'request', label: 'must rollback' },
  { type: 'RenameRegion', regionId: 'missing', label: 'failure' },
]), /region not found/u);
assert.equal(store.toJSONL(), beforeBatch, 'failed batch must restore State and Draft history');

const roundtrip = recordsToJSONL(store.toRecords());
assert.deepEqual(createSemanticMap(parseSemanticMapRecords(roundtrip)).meta, store.domain.meta);
assert.ok(roundtrip.includes('"calendar"'));
assert.ok(roundtrip.includes('"ordinal"'));

const oldSchema = records.map((record, index) => index === 0 ? { ...record, schema: 'semantic-map.v0.1' } : record);
assert.throws(() => createSemanticMap(oldSchema), /is not semantic-map-state\/1/u);
const unknownField = records.map((record, index) => index === 1 ? { ...record, obsolete: true } : record);
assert.throws(() => createSemanticMap(unknownField), /obsolete is not allowed/u);
const both = records.map((record) => record.id === 'request'
  ? { ...record, href: 'https://example.com', mount: { src: '/app#smap=abc' } }
  : record);
assert.throws(() => createSemanticMap(both), /must not define both href and mount/u);
assert.throws(() => store.perform({ type: 'MoveRegions', regionIds: ['map'], dx: 1, dy: 1 }), /no editable regions/u);
assert.notEqual(store.toJSONL(), accepted);

console.log(JSON.stringify({
  schema: 'semantic-map-domain-test/3',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  stateSchema: STATE_SCHEMA,
  operationCount: OPERATION_TYPES.length,
  regions: store.domain.regions.size,
  relations: store.domain.relations.length,
  inactiveAxisPreserved: true,
  failedBatchRolledBack: true,
  oldStateRejected: true,
}));
