import assert from 'node:assert/strict';
import {
  dataPinMap,
  normalizeDataPinRecords,
  splitDataPinJSONL,
  splitDataPinRecords,
} from '../contract.mjs';
import { assertDataMutationAllowed, blockedDataPins } from '../policy.mjs';

const jsonl = [
  JSON.stringify({ id: 'given-input', value: 1 }),
  JSON.stringify({ type: 'data-pin', targetId: 'given-input', basis: 'given', reason: 'provided by the caller' }),
  JSON.stringify({ id: 'derived-output', value: 2 }),
].join('\n');

const parsed = splitDataPinJSONL(jsonl);
assert.equal(parsed.dataRecords.length, 2);
assert.equal(parsed.dataPinRecords.length, 1);
assert.equal(parsed.dataPinRecords[0].targetId, 'given-input');
assert.equal(parsed.dataText.includes('data-pin'), false);
assert.deepEqual(splitDataPinRecords([...parsed.dataRecords, ...parsed.dataPinRecords]).dataPinRecords, parsed.dataPinRecords);

const pins = dataPinMap(parsed.dataPinRecords, new Set(['given-input', 'derived-output']));
assert.equal(blockedDataPins(pins, ['derived-output']).length, 0);
assert.equal(blockedDataPins(pins, ['given-input']).length, 1);
assert.equal(assertDataMutationAllowed(pins, ['derived-output']), true);
assert.throws(() => assertDataMutationAllowed(pins, ['given-input']), /given-input \(given: provided by the caller\)/u);
assert.throws(
  () => normalizeDataPinRecords([
    { type: 'data-pin', targetId: 'missing', basis: 'premise', reason: 'required' },
  ], new Set(['given-input'])),
  /target not found: missing/u,
);
assert.throws(
  () => normalizeDataPinRecords([
    { type: 'data-pin', targetId: 'given-input', basis: 'soft', reason: 'invalid' },
  ]),
  /record.basis must be premise, dependency, given/u,
);

console.log(JSON.stringify({ schema: 'data-pin-tests/1', status: 'PASS', pins: 1, hardByExistence: true }));
