import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const previewRoot = path.resolve(here, '..');
const repoRoot = path.resolve(previewRoot, '../..');
const read = relative => fs.readFile(path.join(previewRoot, relative), 'utf8');
const exists = relative => fs.access(path.join(repoRoot, relative)).then(() => true, () => false);
const load = relative => import(pathToFileURL(path.join(repoRoot, relative)).href);
const loadFeature = async (relative, id) => {
  const url = pathToFileURL(path.join(repoRoot, relative));
  url.searchParams.set('feature', id);
  return (await import(url.href)).feature;
};

for (const retired of [
  'apps/preview/cases.jsonl',
  'apps/preview/resolve-cases.mjs',
  'apps/preview/vite.config.mjs',
  'examples/graph/example.jsonl',
  'examples/seq/example.jsonl',
  'examples/chart/composition.jsonl',
]) assert.equal(await exists(retired), false, `retired path remains: ${retired}`);

for (const required of [
  'examples/presentation/design.json',
  'examples/presentation/presentation.jsonl',
  'examples/control/design.json',
  'examples/control/control.jsonl',
  'examples/control/claims.jsonl',
  'examples/map/example.jsonl',
  'examples/chart/bar-horizontal.jsonl',
  'examples/chart/bar-vertical.jsonl',
  'examples/chart/line.jsonl',
  'examples/chart/pie.jsonl',
  'examples/chart/donut.jsonl',
  'examples/chart/scatter.jsonl',
  'examples/chart/heatmap.jsonl',
  'examples/chart/sunburst.jsonl',
]) assert.equal(await exists(required), true, `missing canonical example: ${required}`);

const business = await load('packages/business-model/feature.mjs');
assert.deepEqual([...business.featureIds], ['graph', 'seq']);
assert.equal(business.getFeature('graph').input, 'presentation');
assert.equal(business.getFeature('seq').input, 'presentation');
assert.equal(business.getFeature('graph').entry, 'packages/business-model/semantic-feature-runtime.mjs');
assert.equal((await loadFeature('packages/business-model/feature.mjs', 'graph')).id, 'graph');

const a2ui = await load('packages/a2ui-browser/feature.mjs');
assert.deepEqual([...a2ui.featureIds], ['control', 'presentation']);
assert.deepEqual([...a2ui.getFeature('control').input], ['design', 'control', 'claims']);
assert.deepEqual([...a2ui.getFeature('presentation').input], ['design', 'presentation']);
assert.equal(a2ui.getFeature('control').entry, 'packages/a2ui-browser/src/feature-app.mjs');
assert.equal(a2ui.getFeature('presentation').entry, a2ui.getFeature('control').entry);
assert.equal((await loadFeature('packages/a2ui-browser/feature.mjs', 'presentation')).id, 'presentation');

const semantic = await load('packages/semantic-map/feature.mjs');
assert.deepEqual([...semantic.featureIds], ['map', 'chart']);
assert.equal(semantic.getFeature('map').input, 'map');
const chartInput = semantic.getFeature('chart').input;
assert.equal(chartInput.default, 'bar-horizontal');
const chartModule = JSON.parse(await fs.readFile(path.join(repoRoot, 'packages/semantic-map/pattern/view-types/chart/module.json'), 'utf8'));
const contractVariants = chartModule.config.types.map(type => type.replace(/\/1$/u, ''));
assert.deepEqual([...chartInput.variants], contractVariants, 'preview chart variants must match chart contract');
for (const variant of contractVariants) {
  assert.equal(semantic.getFeature('chart', variant).view.chart.type, `${variant}/1`);
}
for (const compatible of ['graph', 'seq', 'map', 'chart']) {
  assert.equal((await loadFeature('packages/semantic-map/feature.mjs', compatible)).id, compatible);
}

const baselineCount = business.featureIds.length + a2ui.featureIds.length + 1 + chartInput.variants.length + 1;
assert.equal(baselineCount, 14, 'current preview baseline must remain 14 cases');

const index = await read('index.html');
assert.match(index, /body data-mode="boot"/u);
assert.doesNotMatch(index, /id="request-form"|id="run"/u);
for (const id of ['semantic-id-chip', 'handoff-fab', 'handoff-layer', 'handoff-request', 'review-layer', 'review-preview-panel', 'review-accept', 'review-reject']) {
  assert.match(index, new RegExp(`id="${id}"`, 'u'), `missing canonical feature host control ${id}`);
}
assert.match(index, /img-src 'self' data: blob:/u);

const main = await read('main.mjs');
assert.match(main, /#data required/u);
assert.match(main, /import\.meta\.glob\('\.\.\/\.\.\/packages\/\*\/feature\.mjs'/u);
assert.match(main, /jsonlExamples/u);
assert.match(main, /jsonExamples/u);
assert.match(main, /planModules/u);
assert.match(main, /orphan example/u);
assert.match(main, /duplicate case id/u);
assert.doesNotMatch(main, /__UI_PREVIEW_CASES__|cases\.jsonl|resolve-cases|artifact-shell|publication/u);
const packageJson = JSON.parse(await read('package.json'));
assert.match(packageJson.scripts.build, /vite@8\.3\.0/u);

console.log(JSON.stringify({
  schema: 'ui-preview-check/5',
  status: 'PASS',
  cases: baselineCount,
  registry: false,
  featureRuntimeSource: 'packages/*/feature.mjs',
  compositeInputs: true,
  orphanExamplesFailClosed: true,
}));
