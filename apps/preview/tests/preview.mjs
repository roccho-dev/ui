import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPreviewCaseDeclarations, resolvePreviewCases } from '../resolve-cases.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const previewRoot = path.resolve(here, '..');
const repoRoot = path.resolve(previewRoot, '../..');
const read = relative => fs.readFile(path.join(previewRoot, relative), 'utf8');
const declarations = await readPreviewCaseDeclarations();
const cases = await resolvePreviewCases();
const sourcePaths = source => typeof source === 'string' ? [source] : Object.values(source);

assert.equal(cases.length, declarations.length);
assert.equal(new Set(cases.map(item => item.id)).size, cases.length, 'case ids must be unique');
for (const required of ['graph', 'map', 'seq', 'chart', 'presentation', 'control']) {
  assert.ok(cases.some(item => item.id === required), `missing ${required}`);
}
for (const variant of ['bar-horizontal', 'bar-vertical', 'line', 'pie', 'donut', 'scatter', 'heatmap', 'sunburst']) {
  assert.ok(cases.some(item => item.id === `chart/${variant}`), `missing chart/${variant}`);
}

for (const declaration of declarations) {
  assert.equal(typeof declaration.id, 'string');
  assert.equal(typeof declaration.featureModule, 'string');
  assert.equal(typeof declaration.featureId, 'string');
  assert.ok(typeof declaration.source === 'string' || (declaration.source && typeof declaration.source === 'object' && !Array.isArray(declaration.source)));
  assert.equal(Object.hasOwn(declaration, 'entry'), false, `${declaration.id}: entry belongs to package feature`);
  assert.equal(Object.hasOwn(declaration, 'styles'), false, `${declaration.id}: styles belong to package feature`);
  await fs.access(path.join(repoRoot, declaration.featureModule));
  for (const source of sourcePaths(declaration.source)) await fs.access(path.join(repoRoot, source));
}
for (const item of cases) {
  assert.equal(typeof item.feature.entry, 'string');
  assert.ok(Array.isArray(item.feature.styles));
  await fs.access(path.join(repoRoot, item.feature.entry));
  for (const style of item.feature.styles) await fs.access(path.join(repoRoot, style));
  if (item.feature.plan) await fs.access(path.join(repoRoot, item.feature.plan));
  if (item.id.startsWith('chart')) {
    assert.equal(item.feature.view?.pattern, 'chart/1');
    assert.equal(typeof item.feature.view?.chart?.type, 'string');
  }
}

const graph = cases.find(item => item.id === 'graph');
const seq = cases.find(item => item.id === 'seq');
const presentation = cases.find(item => item.id === 'presentation');
const control = cases.find(item => item.id === 'control');
assert.deepEqual(graph.feature.styles, [
  'packages/semantic-map/feature.css',
  'packages/semantic-map/authoring/styles/handoff.css',
  'packages/semantic-map/authoring/styles/review.css',
]);
assert.equal(graph.source, seq.source, 'Graph and Seq must share one semantic source');
assert.equal(presentation.source.presentation, graph.source, 'Presentation must consume the same semantic source');
assert.equal(presentation.feature.entry, 'packages/a2ui-browser/src/feature-app.mjs');
assert.equal(control.feature.entry, presentation.feature.entry, 'Control and Presentation must share the common A2UI app entry');
assert.deepEqual(Object.keys(control.source).sort(), ['claims', 'control', 'design']);
assert.deepEqual(Object.keys(presentation.source).sort(), ['design', 'presentation']);

const index = await read('index.html');
assert.match(index, /body data-mode="boot"/u);
assert.doesNotMatch(index, /id="request-form"|id="run"/u);
for (const id of ['semantic-id-chip', 'handoff-fab', 'handoff-layer', 'handoff-request', 'review-layer', 'review-preview-panel', 'review-accept', 'review-reject']) {
  assert.match(index, new RegExp(`id="${id}"`, 'u'), `missing canonical feature host control ${id}`);
}
assert.match(index, /img-src 'self' data: blob:/u);
const main = await read('main.mjs');
assert.match(main, /#data required/u);
assert.match(main, /import\.meta\.glob/u);
assert.match(main, /jsonExamples/u);
assert.match(main, /planModules/u);
assert.match(main, /__UI_PREVIEW_CASES__/u);
assert.doesNotMatch(main, /cases\.jsonl\?raw|artifact-shell|publication/u);
const config = await read('vite.config.mjs');
assert.match(config, /resolvePreviewCases/u);
assert.match(config, /__UI_PREVIEW_CASES__/u);
const packageJson = JSON.parse(await read('package.json'));
assert.match(packageJson.scripts.build, /vite@8\.3\.0/u);

console.log(JSON.stringify({ schema: 'ui-preview-check/4', status: 'PASS', cases: cases.length, featureRuntimeSource: 'packages/**/feature.mjs', compositeInputs: true, canonicalFeatureHost: true }));
