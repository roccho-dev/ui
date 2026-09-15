import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const repo = new URL('../../../', import.meta.url);
const exists = async url => fs.access(url).then(() => true, () => false);
assert.equal(await exists(new URL('packages/comptime/', repo)), false, 'packages/comptime must stay retired');
assert.equal(await exists(new URL('packages/decisions-compiler/', repo)), false, 'misleading decisions-compiler package must stay retired');
assert.equal(await exists(new URL('examples/shared/', repo)), false, 'shared Presentation input directory must stay retired');
assert.equal(await exists(new URL('apps/artifact-shell/adapters/', repo)), false, 'artifact shell must not own feature preview adapters');
assert.equal(await exists(new URL('apps/artifact-shell/publication/', repo)), false, 'artifact shell must not own feature preview publication helpers');

for (const path of [
  'packages/control/catalog.mjs',
  'packages/control/design.json',
  'packages/control/feature.mjs',
  'packages/control/render.mjs',
  'packages/presentation/feature.mjs',
  'packages/presentation/render.mjs',
  'packages/presentation/render/catalog.mjs',
  'packages/presentation/styles.css',
  'packages/business-model/presentation-feature-runtime.mjs',
  'packages/business-model/presentation.mjs',
  'packages/presentation/compiler/catalog.mjs',
  'packages/presentation/compiler/index.mjs',
  'packages/presentation/compiler/model.mjs',
  'packages/presentation/compiler/projectors.mjs',
  'packages/presentation/compiler/sequence.mjs',
  'packages/presentation/contracts.mjs',
]) assert.equal(await exists(new URL(path, repo)), false, `${path} must stay retired`);

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
assert.equal(JSON.stringify(controlDesign).includes('"fields"'), false, 'Control Tree must project properties generically without a fields allowlist');

const previewCases = (await fs.readFile(new URL('apps/preview/cases.jsonl', repo), 'utf8'))
  .split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
const byId = id => previewCases.find(item => item.id === id);
const graph = byId('graph');
const seq = byId('seq');
const presentation = byId('presentation');
const control = byId('control');
assert.equal(graph.source, seq.source, 'Graph and Seq must share Presentation semantic JSONL');
assert.equal(presentation.source.presentation, graph.source, 'Presentation must reuse Graph/Seq semantic JSONL');
assert.equal(presentation.featureModule, 'packages/a2ui-browser/feature.mjs');
assert.equal(control.featureModule, presentation.featureModule, 'Control and Presentation must share A2UI feature descriptor');
assert.deepEqual(Object.keys(presentation.source).sort(), ['design', 'presentation']);
assert.deepEqual(Object.keys(control.source).sort(), ['claims', 'control', 'design']);

for (const id of ['graph', 'map', 'seq']) {
  const examples = await fs.readdir(new URL(`examples/${id}/`, repo));
  assert.deepEqual(examples.sort(), ['example.jsonl'], `${id} UI example must be raw JSONL only`);
  const source = await fs.readFile(new URL(`examples/${id}/example.jsonl`, repo), 'utf8');
  const rows = source.trim().split(/\r?\n/u).map(line => JSON.parse(line));
  assert.ok(rows.length > 1, `${id} UI example must contain JSONL records`);
}

const previewMain = await fs.readFile(new URL('apps/preview/main.mjs', repo), 'utf8');
for (const [name, source] of [['preview main', previewMain], ['preview cases', JSON.stringify(previewCases)]]) {
  for (const forbidden of ['compile' + ':', 'source-compiler', 'decisions-compiler', 'business-model-semantic-jsonl']) {
    assert.equal(source.includes(forbidden), false, `${name} must not contain ${forbidden}`);
  }
}
const runtimeData = await fs.readFile(new URL('packages/business-model/runtime-data.mjs', repo), 'utf8');
assert.doesNotMatch(runtimeData, /type.*presentation|PRESENTATION_A2UI|parsePresentation/u, 'business-model runtime parser must not own Presentation A2UI fallback');
const compilerFiles = await fs.readdir(new URL('packages/presentation/compiler/', repo));
assert.deepEqual(compilerFiles.sort(), ['profile.mjs', 'public-profile.mjs'], 'Presentation compiler must keep pure profile helpers only');

console.log('source-compiler boundary: PASS');
