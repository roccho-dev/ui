import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const repo = new URL('../../../', import.meta.url);
const exists = async url => fs.access(url).then(() => true, () => false);
assert.equal(await exists(new URL('packages/comptime/', repo)), false, 'packages/comptime must stay retired');
assert.equal(await exists(new URL('packages/decisions-compiler/', repo)), false, 'misleading decisions-compiler package must stay retired');
assert.equal(await exists(new URL('examples/presentation/', repo)), false, 'compiled presentation examples must stay retired');

const sharedExamples = await fs.readdir(new URL('examples/shared/', repo));
assert.deepEqual(sharedExamples.sort(), ['presentation.jsonl'], 'shared runtime data must have one canonical example');
const sharedSource = await fs.readFile(new URL('examples/shared/presentation.jsonl', repo), 'utf8');
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

for (const id of ['graph', 'map', 'seq', 'presentation', 'control']) {
  const adapter = await fs.readFile(new URL(`apps/artifact-shell/adapters/${id}.mjs`, repo), 'utf8');
  assert.equal(adapter.includes('compile:'), false, `${id} adapter must not own source compilation`);
  assert.equal(adapter.includes('source-compiler'), false, `${id} adapter must not depend on source compiler`);
  assert.equal(adapter.includes('business-model-semantic-jsonl'), false, `${id} adapter must not know upstream source schema`);
}

const publication = await fs.readFile(new URL('apps/artifact-shell/publication/build-adapters.mjs', repo), 'utf8');
for (const forbidden of ['adapter.compile', 'source-compiler', 'decisions-compiler', 'business-model-semantic-jsonl']) {
  assert.equal(publication.includes(forbidden), false, `publication must not contain ${forbidden}`);
}

console.log('source-compiler boundary: PASS');
