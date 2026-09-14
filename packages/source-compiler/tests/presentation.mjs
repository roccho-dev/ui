import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { compilePresentation } from '../presentation.mjs';

const fixtureRoot = new URL('../fixtures/presentation/', import.meta.url);
const uiExample = JSON.parse(await fs.readFile(new URL('../../../examples/presentation/example.json', import.meta.url), 'utf8'));
for (const name of ['2-actors.jsonl', '3-actors.jsonl', '4-actors.jsonl']) {
  const source = await fs.readFile(new URL(name, fixtureRoot), 'utf8');
  const compiled = await compilePresentation(source);
  assert.equal(compiled.schema, 'business-model-presentation-minimal-payload/1');
  assert.equal(compiled.coverage?.pass, true);
  if (name === '2-actors.jsonl') assert.deepEqual(compiled, uiExample);
}
console.log('source-compiler presentation: PASS');
