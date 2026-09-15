import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const previewRoot = path.resolve(here, '..');
const repoRoot = path.resolve(previewRoot, '../..');
const read = relative => fs.readFile(path.join(previewRoot, relative), 'utf8');
const lines = (await read('cases.jsonl')).split(/\r?\n/u).filter(Boolean);
const cases = lines.map((line, index) => {
  try { return JSON.parse(line); } catch (error) { throw new Error(`preview case line ${index + 1}: ${error.message}`); }
});

assert.ok(cases.length > 0);
assert.equal(new Set(cases.map(item => item.id)).size, cases.length, 'case ids must be unique');
for (const required of ['graph', 'map', 'seq', 'chart', 'presentation', 'control']) {
  assert.ok(cases.some(item => item.id === required), `missing ${required}`);
}
for (const variant of ['bar-horizontal', 'bar-vertical', 'line', 'pie', 'donut', 'scatter', 'heatmap', 'sunburst']) {
  assert.ok(cases.some(item => item.id === `chart/${variant}`), `missing chart/${variant}`);
}

for (const item of cases) {
  assert.equal(typeof item.id, 'string');
  assert.equal(typeof item.featureModule, 'string');
  assert.equal(typeof item.featureId, 'string');
  assert.equal(typeof item.source, 'string');
  await fs.access(path.join(repoRoot, item.source));
  const featurePath = path.join(repoRoot, item.featureModule);
  await fs.access(featurePath);
  const loaded = await import(`${pathToFileURL(featurePath).href}?preview-check=${encodeURIComponent(item.id)}`);
  assert.equal(typeof loaded.resolveFeature, 'function', `${item.id}: resolveFeature required`);
  const feature = loaded.resolveFeature(item.featureId);
  assert.equal(feature.id, item.featureId);
  await fs.access(path.join(repoRoot, feature.entry));
  for (const style of feature.styles ?? []) await fs.access(path.join(repoRoot, style));
  if (item.id.startsWith('chart')) {
    assert.equal(item.view?.pattern, 'chart/1');
    assert.equal(typeof item.view?.chart?.type, 'string');
  }
}

const index = await read('index.html');
assert.match(index, /body data-mode="boot"/u);
assert.doesNotMatch(index, /textarea|id="run"|request-form/u);
const main = await read('main.mjs');
assert.match(main, /#data required/u);
assert.match(main, /import\.meta\.glob/u);
assert.doesNotMatch(main, /artifact-shell|publication/u);
const packageJson = JSON.parse(await read('package.json'));
assert.match(packageJson.scripts.build, /vite@8\.3\.0/u);

console.log(JSON.stringify({ schema: 'ui-preview-check/1', status: 'PASS', cases: cases.length }));
