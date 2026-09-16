import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { getFeature as getA2uiFeature } from '../../a2ui-browser/feature.mjs';
import { getFeature as getBusinessFeature } from '../../business-model/feature.mjs';

const repo = new URL('../../../', import.meta.url);
const exists = async url => fs.access(url).then(() => true, () => false);
assert.equal(await exists(new URL('packages/comptime/', repo)), false, 'packages/comptime must stay retired');
assert.equal(await exists(new URL('packages/decisions-compiler/', repo)), false, 'misleading decisions-compiler package must stay retired');
assert.equal(await exists(new URL('examples/shared/', repo)), false, 'shared Presentation input directory must stay retired');
assert.equal(await exists(new URL('apps/artifact-shell/adapters/', repo)), false, 'artifact shell must not own feature preview adapters');
assert.equal(await exists(new URL('apps/artifact-shell/publication/', repo)), false, 'artifact shell must not own feature preview publication helpers');
assert.equal(await exists(new URL('apps/preview/cases.jsonl', repo)), false, 'preview case registry must stay retired');
assert.equal(await exists(new URL('apps/preview/resolve-cases.mjs', repo)), false, 'preview case resolver must stay retired');

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

const graph = getBusinessFeature('graph');
const seq = getBusinessFeature('seq');
const presentation = getA2uiFeature('presentation');
const control = getA2uiFeature('control');
assert.equal(graph.input, seq.input, 'Graph and Seq must share Presentation semantic JSONL');
assert.equal(graph.input, 'presentation');
assert.ok(presentation.input.includes(graph.input), 'Presentation must reuse Graph/Seq semantic JSONL');
assert.equal(presentation.entry, 'packages/a2ui-browser/src/feature-app.mjs');
assert.equal(control.entry, presentation.entry, 'Control and Presentation must share A2UI feature descriptor');
assert.deepEqual([...presentation.input].sort(), ['design', 'presentation']);
assert.deepEqual([...control.input].sort(), ['claims', 'control', 'design']);

for (const id of ['map']) {
  const examples = await fs.readdir(new URL(`examples/${id}/`, repo));
  assert.deepEqual(examples.sort(), ['example.jsonl'], `${id} UI example must be raw JSONL only`);
  const source = await fs.readFile(new URL(`examples/${id}/example.jsonl`, repo), 'utf8');
  const rows = source.trim().split(/\r?\n/u).map(line => JSON.parse(line));
  assert.ok(rows.length > 1, `${id} UI example must contain JSONL records`);
}
assert.equal(await exists(new URL('examples/graph/', repo)), false, 'Graph must reuse Presentation semantic input');
assert.equal(await exists(new URL('examples/seq/', repo)), false, 'Seq must reuse Presentation semantic input');

const previewMain = await fs.readFile(new URL('apps/preview/main.mjs', repo), 'utf8');
for (const forbidden of ['compile' + ':', 'source-compiler', 'decisions-compiler', 'business-model-semantic-jsonl']) {
  assert.equal(previewMain.includes(forbidden), false, `preview main must not contain ${forbidden}`);
}
const runtimeData = await fs.readFile(new URL('packages/business-model/runtime-data.mjs', repo), 'utf8');
assert.doesNotMatch(runtimeData, /type.*presentation|PRESENTATION_A2UI|parsePresentation/u, 'business-model runtime parser must not own Presentation A2UI fallback');
const compilerFiles = await fs.readdir(new URL('packages/presentation/compiler/', repo));
assert.deepEqual(compilerFiles.sort(), ['profile.mjs', 'public-profile.mjs'], 'Presentation compiler must keep pure profile helpers only');

console.log('source-compiler boundary: PASS');
