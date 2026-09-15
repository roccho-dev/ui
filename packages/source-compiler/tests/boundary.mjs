import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const repo = new URL('../../../', import.meta.url);
const exists = async url => fs.access(url).then(() => true, () => false);
assert.equal(await exists(new URL('packages/comptime/', repo)), false, 'packages/comptime must stay retired');
assert.equal(await exists(new URL('packages/decisions-compiler/', repo)), false, 'misleading decisions-compiler package must stay retired');
assert.equal(await exists(new URL('examples/presentation/', repo)), false, 'compiled presentation examples must stay retired');

const sharedExamples = await fs.readdir(new URL('examples/shared/', repo));
assert.deepEqual(sharedExamples.sort(), ['business-model.jsonl'], 'shared runtime data must have one canonical example');
const sharedSource = await fs.readFile(new URL('examples/shared/business-model.jsonl', repo), 'utf8');
const sharedRows = sharedSource.trim().split(/\r?\n/u).map(line => JSON.parse(line));
const presentationRows = sharedRows.filter(row => row.type === 'presentation');
assert.equal(presentationRows.length, 1, 'shared runtime data requires exactly one presentation record');
assert.equal(presentationRows[0].schema, 'business-model-presentation-a2ui/1');
assert.ok(sharedRows.some(row => row.type === 'meta' && row.schema === 'business-model-semantic-jsonl/2'), 'shared runtime data requires semantic records');

for (const id of ['graph', 'map', 'seq']) {
  const examples = await fs.readdir(new URL(`examples/${id}/`, repo));
  assert.deepEqual(examples.sort(), ['example.jsonl'], `${id} UI example must be raw JSONL only`);
  const source = await fs.readFile(new URL(`examples/${id}/example.jsonl`, repo), 'utf8');
  const rows = source.trim().split(/\r?\n/u).map(line => JSON.parse(line));
  assert.ok(rows.length > 1, `${id} UI example must contain JSONL records`);
}

const previewMain = await fs.readFile(new URL('apps/preview/main.mjs', repo), 'utf8');
const previewCases = await fs.readFile(new URL('apps/preview/cases.jsonl', repo), 'utf8');
for (const [name, source] of [['preview main', previewMain], ['preview cases', previewCases]]) {
  for (const forbidden of ['compile' + ':', 'source-compiler', 'decisions-compiler', 'business-model-semantic-jsonl']) {
    assert.equal(source.includes(forbidden), false, `${name} must not contain ${forbidden}`);
  }
}
assert.equal(await exists(new URL('apps/artifact-shell/adapters/', repo)), false, 'artifact shell must not own feature preview adapters');
assert.equal(await exists(new URL('apps/artifact-shell/publication/', repo)), false, 'artifact shell must not own feature preview publication helpers');

console.log('source-compiler boundary: PASS');
