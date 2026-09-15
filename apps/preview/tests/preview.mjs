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
  assert.equal(typeof declaration.source, 'string');
  assert.equal(Object.hasOwn(declaration, 'entry'), false, `${declaration.id}: entry belongs to package feature`);
  assert.equal(Object.hasOwn(declaration, 'styles'), false, `${declaration.id}: styles belong to package feature`);
  await fs.access(path.join(repoRoot, declaration.featureModule));
  await fs.access(path.join(repoRoot, declaration.source));
}
for (const item of cases) {
  assert.equal(typeof item.feature.entry, 'string');
  assert.ok(Array.isArray(item.feature.styles));
  await fs.access(path.join(repoRoot, item.feature.entry));
  for (const style of item.feature.styles) await fs.access(path.join(repoRoot, style));
  if (item.id.startsWith('chart')) {
    assert.equal(item.feature.view?.pattern, 'chart/1');
    assert.equal(typeof item.feature.view?.chart?.type, 'string');
  }
}

const graph = cases.find(item => item.id === 'graph');
assert.deepEqual(graph.feature.styles, [
  'packages/semantic-map/feature.css',
  'packages/semantic-map/authoring/styles/handoff.css',
  'packages/semantic-map/authoring/styles/review.css',
]);

const index = await read('index.html');
assert.match(index, /body data-mode="boot"/u);
assert.doesNotMatch(index, /textarea|id="run"|request-form/u);
const main = await read('main.mjs');
assert.match(main, /#data required/u);
assert.match(main, /import\.meta\.glob/u);
assert.match(main, /__UI_PREVIEW_CASES__/u);
assert.doesNotMatch(main, /cases\.jsonl\?raw|artifact-shell|publication/u);
const config = await read('vite.config.mjs');
assert.match(config, /resolvePreviewCases/u);
assert.match(config, /__UI_PREVIEW_CASES__/u);
const packageJson = JSON.parse(await read('package.json'));
assert.match(packageJson.scripts.build, /vite@8\.3\.0/u);

console.log(JSON.stringify({ schema: 'ui-preview-check/2', status: 'PASS', cases: cases.length, featureRuntimeSource: 'packages/**/feature.mjs' }));
