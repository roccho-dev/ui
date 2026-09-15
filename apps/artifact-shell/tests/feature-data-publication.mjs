import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUrlModuleUrl, readUrlModule } from '../../../packages/url-module/src/index.mjs';
import { createControlCatalog } from '../../../packages/control/catalog.mjs';
import { parseClaims, parseControl } from '../../../packages/control/src/control-graph.mjs';
import { createAdapter as createChartAdapter } from '../adapters/chart.mjs';
import { createAdapter as createControlAdapter } from '../adapters/control.mjs';
import { createAdapter as createGraphAdapter } from '../adapters/graph.mjs';
import { createAdapter as createMapAdapter } from '../adapters/map.mjs';
import { createAdapter as createPresentationAdapter } from '../adapters/presentation.mjs';
import { createAdapter as createSeqAdapter } from '../adapters/seq.mjs';
import { buildArtifactShellPublication } from '../src/publication.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const repoRoot = path.resolve(appRoot, '../..');
const tempRoot = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'feature-data-publication-'));
const outputRoot = path.join(tempRoot, 'publication');
const chart = createChartAdapter();
const controlAdapter = createControlAdapter();
const adapters = [createGraphAdapter(), createMapAdapter(), createSeqAdapter(), chart, createPresentationAdapter(), controlAdapter];
const chartVariantIds = Object.freeze(['bar-horizontal', 'bar-vertical', 'line', 'pie', 'donut', 'scatter', 'heatmap', 'sunburst']);

const readSourceFile = async sourcePath => sourcePath.endsWith('.jsonl')
  ? fs.readFile(path.join(repoRoot, sourcePath), 'utf8')
  : JSON.parse(await fs.readFile(path.join(repoRoot, sourcePath), 'utf8'));
const readSource = async source => {
  if (typeof source === 'string') return readSourceFile(source);
  const entries = await Promise.all(Object.entries(source).map(async ([id, sourcePath]) => [id, await readSourceFile(sourcePath)]));
  return Object.freeze(Object.fromEntries(entries));
};
const assertHashOnlyHost = async routeRoot => {
  await assert.rejects(
    () => fs.access(path.join(routeRoot, 'input.json')),
    { code: 'ENOENT' },
    `${routeRoot}: input.json must not be published`,
  );
  const host = await fs.readFile(path.join(routeRoot, 'host.mjs'), 'utf8');
  assert.match(host, /#data required/u);
  assert.doesNotMatch(host, /input\.json|searchParams|http-resource/u);
  assert.doesNotMatch(host, /createUrlModuleFieldsUrl|replaceRecords|toJSONL|captureFeaturePng|uiFeatureShare|createObjectURL|Canvas 2D/u);
};

assert.deepEqual(chart.variants.map(variant => variant.id), chartVariantIds, 'chart: exact eight publication variants required');
assert.throws(
  () => assert.deepEqual(chart.variants.slice(0, -1).map(variant => variant.id), chartVariantIds),
  /Expected values to be strictly deep-equal/u,
  'negative control: a missing chart publication variant must fail the contract',
);

await buildArtifactShellPublication({
  capabilitiesRoot: path.join(appRoot, 'capabilities'),
  outputRoot,
  repoRoot,
});

const launcher = await fs.readFile(path.join(outputRoot, 'index.html'), 'utf8');
let variantRoutes = 0;

for (const adapter of adapters) {
  const { id, source: sourceSpec } = adapter;
  const match = launcher.match(new RegExp(`href="(adapters/${id}/#data=[^"]+)"`, 'u'));
  assert.ok(match, `${id}: explicit #data launcher link required`);
  const decoded = await readUrlModule({ fragment: 'data', input: new URL(match[1], 'https://artifact-shell.invalid/').href });
  const source = await readSource(sourceSpec);
  assert.deepEqual(decoded, source, `${id}: #data must preserve adapter source`);
  await assertHashOnlyHost(path.join(outputRoot, 'adapters', id));

  for (const variant of adapter.variants ?? []) {
    const routeRoot = path.join(outputRoot, 'adapters', id, variant.id);
    const feature = JSON.parse(await fs.readFile(path.join(routeRoot, 'feature.json'), 'utf8'));
    assert.deepEqual(feature.view, variant.view, `${id}/${variant.id}: published view must match adapter variant`);
    const variantSource = await readSource(variant.source);
    const encoded = await createUrlModuleUrl({
      base: `https://artifact-shell.invalid/adapters/${id}/${variant.id}/`,
      fragment: 'data',
      value: variantSource,
    });
    const variantDecoded = await readUrlModule({ fragment: 'data', input: encoded });
    assert.deepEqual(variantDecoded, variantSource, `${id}/${variant.id}: #data must preserve variant source`);
    await assertHashOnlyHost(routeRoot);
    variantRoutes += 1;
  }
}

const controlSource = await readSource(controlAdapter.source);
const controlRecords = parseControl(controlSource.control);
const claims = parseClaims(controlSource.claims, controlRecords);
assert.ok(claims.length > 0 && claims.every(claim => claim.op === 'report'), 'control: claims default to D reports');
assert.ok(claims.every(claim => controlRecords.some(record => record.id === claim.rel.parent)), 'control: claims rel.parent must resolve to control ids');
const controlFeature = JSON.parse(await fs.readFile(path.join(outputRoot, 'adapters', 'control', 'feature.json'), 'utf8'));
assert.deepEqual(controlFeature.styles, [], 'control: fixed design must not live in shell styles');
const design = JSON.parse(await fs.readFile(path.join(outputRoot, 'modules', 'packages', 'control', 'design.json'), 'utf8'));
assert.equal(design.schema, 'ui-control-a2ui-design/1');
const controlCatalog = createControlCatalog({ id: design.catalogId });
for (const component of design.messages.find(message => message.updateComponents).updateComponents.components) controlCatalog.validateComponent(component);
assert.deepEqual(
  design.messages.find(message => message.updateComponents).updateComponents.components.filter(component => component.component === 'Pane').map(component => component.title),
  ['control.jsonl', 'claims.jsonl'],
  'control: design.json owns both panes',
);
const controlRender = await fs.readFile(path.join(outputRoot, 'modules', 'packages', 'control', 'render.mjs'), 'utf8');
assert.doesNotMatch(controlRender, /control-panes|pane-head|relation-toggle|policy · UI \/ P|D reports/u, 'control: fixed design must not leak into runtime');

for (const relative of [
  'packages/semantic-map/authoring/handoff.js',
  'packages/semantic-map/authoring/review.js',
  'packages/semantic-map/authoring/runtime.js',
  'packages/semantic-map/transport/smap-delivery.js',
]) {
  assert.deepEqual(
    await fs.readFile(path.join(outputRoot, 'modules', relative)),
    await fs.readFile(path.join(repoRoot, relative)),
    `${relative}: publication must reuse canonical bytes`,
  );
}
const canonicalApp = await fs.readFile(path.join(outputRoot, 'app', 'index.html'), 'utf8');
assert.match(canonicalApp, /\.\.\/modules\/packages\/semantic-map\/authoring\/index\.js/u);
assert.doesNotMatch(canonicalApp, /@(?:INLINE_IMPORTMAP|PAGE_CONFIG|INITIAL_DOCUMENT|EMBEDDED_NOTICES)/u);

assert.equal(variantRoutes, 8, 'exactly eight chart variant publication routes required');
console.log(JSON.stringify({
  schema: 'ui.feature-data-publication-proof/3',
  status: 'PASS',
  features: adapters.map(adapter => adapter.id),
  chartVariants: chartVariantIds,
  variantRoutes,
  canonicalSemanticHandoff: true,
  control: { inputs: Object.keys(controlAdapter.source), claims: claims.length, design: design.schema },
  negativeControls: ['missing-chart-variant', 'parallel-share-path'],
}));
