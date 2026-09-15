import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const repo = new URL('../../../', import.meta.url);
const exists = async url => fs.access(url).then(() => true, () => false);
assert.equal(await exists(new URL('packages/comptime/', repo)), false, 'packages/comptime must stay retired');
assert.equal(await exists(new URL('packages/decisions-compiler/', repo)), false, 'misleading decisions-compiler package must stay retired');
assert.equal(await exists(new URL('examples/shared/', repo)), false, 'shared Presentation input directory must stay retired');

const presentationExamples = await fs.readdir(new URL('examples/presentation/', repo));
assert.deepEqual(presentationExamples.sort(), ['design.json', 'presentation.jsonl'], 'Presentation input must be design.json + presentation.jsonl');
const presentationSource = await fs.readFile(new URL('examples/presentation/presentation.jsonl', repo), 'utf8');
const presentationRows = presentationSource.trim().split(/\r?\n/u).map(line => JSON.parse(line));
assert.equal(presentationRows.some(row => row.type === 'presentation'), false, 'Presentation JSONL must stay semantic-only');
assert.ok(presentationRows.some(row => row.type === 'meta' && row.schema === 'business-model-semantic-jsonl/2'), 'Presentation JSONL requires semantic records');
const presentationDesign = JSON.parse(await fs.readFile(new URL('examples/presentation/design.json', repo), 'utf8'));
assert.equal(presentationDesign.schema, 'ui-a2ui-app-design/1');
assert.equal(presentationDesign.app, 'presentation');

const controlExamples = await fs.readdir(new URL('examples/control/', repo));
assert.deepEqual(controlExamples.sort(), ['claims.jsonl', 'control.jsonl', 'design.json'], 'Control input must be design.json + JSONL data');
const controlDesign = JSON.parse(await fs.readFile(new URL('examples/control/design.json', repo), 'utf8'));
assert.equal(controlDesign.schema, 'ui-a2ui-app-design/1');
assert.equal(controlDesign.app, 'control');

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

const controlAdapter = await fs.readFile(new URL('apps/artifact-shell/adapters/control.mjs', repo), 'utf8');
const presentationAdapter = await fs.readFile(new URL('apps/artifact-shell/adapters/presentation.mjs', repo), 'utf8');
assert.match(controlAdapter, /packages\/a2ui-browser\/feature\.mjs/u, 'Control must use common A2UI feature entry');
assert.match(presentationAdapter, /packages\/a2ui-browser\/feature\.mjs/u, 'Presentation must use common A2UI feature entry');

const publication = await fs.readFile(new URL('apps/artifact-shell/publication/build-adapters.mjs', repo), 'utf8');
for (const forbidden of ['adapter.compile', 'source-compiler', 'decisions-compiler', 'business-model-semantic-jsonl']) {
  assert.equal(publication.includes(forbidden), false, `publication must not contain ${forbidden}`);
}

console.log('source-compiler boundary: PASS');
