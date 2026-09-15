import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { parseBusinessModelRuntimeJsonl } from '../../business-model/runtime-data.mjs';
import { compilePresentationRuntimeData } from '../presentation.mjs';

const fixtureRoot = new URL('../fixtures/presentation/', import.meta.url);
const sharedExample = await fs.readFile(new URL('../../../examples/shared/business-model.jsonl', import.meta.url), 'utf8');
for (const name of ['2-actors.jsonl', '3-actors.jsonl', '4-actors.jsonl']) {
  const source = await fs.readFile(new URL(name, fixtureRoot), 'utf8');
  const compiled = compilePresentationRuntimeData(source);
  const parsed = parseBusinessModelRuntimeJsonl(compiled);
  assert.equal(parsed.schema, 'business-model-runtime-data/1');
  assert.equal(parsed.presentation?.schema, 'business-model-presentation-a2ui/1');
  assert.equal(parsed.semanticText, source.endsWith('\n') ? source : `${source}\n`);
  if (name === '2-actors.jsonl') assert.equal(compiled, sharedExample);
}
console.log('source-compiler presentation runtime data: PASS');
