import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { splitDataPinJSONL } from '../../data-pin/contract.mjs';
import { parseBusinessModelSemanticJsonl } from '../../business-model/model.mjs';
import { compilePresentationRuntimeData } from '../presentation.mjs';

const fixtureRoot = new URL('../fixtures/presentation/', import.meta.url);
const canonicalExample = await fs.readFile(new URL('../../../examples/presentation/presentation.jsonl', import.meta.url), 'utf8');
for (const name of ['2-actors.jsonl', '3-actors.jsonl', '4-actors.jsonl']) {
  const source = await fs.readFile(new URL(name, fixtureRoot), 'utf8');
  const compiled = compilePresentationRuntimeData(source);
  const separated = splitDataPinJSONL(compiled);
  const parsed = parseBusinessModelSemanticJsonl(separated.dataText);
  assert.equal(parsed.schema, 'business-model-semantic-state/2');
  assert.equal(compiled, source.endsWith('\n') ? source : `${source}\n`);
  if (name === '2-actors.jsonl') {
    assert.equal(compiled, canonicalExample);
    assert.equal(separated.dataPinRecords.length, 1);
    assert.equal(separated.dataPinRecords[0].targetId, 'case-records');
  }
}
console.log('source-compiler presentation semantic data: PASS');
