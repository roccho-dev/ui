import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUrlModuleUrl, readUrlModule } from '../../../packages/url-module/src/index.mjs';
import { createControlCatalog } from '../../../packages/a2ui-browser/src/catalog/control.mjs';
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
const presentationAdapter = createPresentationAdapter();
const graphAdapter = createGraphAdapter();
const seqAdapter = createSeqAdapter();
const adapters = [graphAdapter, createMapAdapter(), seqAdapter, chart, presentationAdapter, controlAdapter];
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
  await assert.rejects(() => fs.access(path.join(routeRoot, 'input.json')), { code: 'ENOENT' }, `${routeRoot}: input.json must not be published`);
  const host = await fs.readFile(path.join(routeRoot, 'host.mjs'), 'utf8');
  assert.match(host, /#data required/u);
  assert.doesNotMatch(host, /input\.json|searchParams|http-resource/u);
};

assert.deepEqual(chart.variants.map(variant => variant.id), chartVariantIds, 'chart: exact eight publication variants required');
await buildArtifactShellPublication({ capabilitiesRoot: path.join(appRoot, 'capabilities'), outputRoot, repoRoot });

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
    const encoded = await createUrlModuleUrl({ base: `https://artifact-shell.invalid/adapters/${id}/${variant.id}/`, fragment: 'data', value: variantSource });
    const variantDecoded = await readUrlModule({ fragment: 'data', input: encoded });
    assert.deepEqual(variantDecoded, variantSource, `${id}/${variant.id}: #data must preserve variant source`);
    await assertHashOnlyHost(routeRoot);
    variantRoutes += 1;
  }
}

const controlSource = await readSource(controlAdapter.source);
assert.deepEqual(Object.keys(controlSource).sort(), ['claims', 'control', 'design']);
assert.equal(controlSource.design.schema, 'ui-a2ui-app-design/1');
assert.equal(controlSource.design.app, 'control');
const controlRecords = parseControl(controlSource.control);
const claims = parseClaims(controlSource.claims, controlRecords);
assert.ok(claims.length > 0 && claims.every(claim => claim.op === 'report'), 'control: claims default to D reports');
assert.ok(claims.every(claim => controlRecords.some(record => record.id === claim.rel.parent)), 'control: claims rel.parent must resolve to control ids');
const controlCatalog = createControlCatalog({ id: controlSource.design.catalogId });
for (const component of controlSource.design.messages.find(message => message.updateComponents).updateComponents.components) controlCatalog.validateComponent(component);

const presentationSource = await readSource(presentationAdapter.source);
assert.deepEqual(Object.keys(presentationSource).sort(), ['design', 'presentation']);
assert.equal(presentationSource.design.schema, 'ui-a2ui-app-design/1');
assert.equal(presentationSource.design.app, 'presentation');
assert.equal(presentationSource.presentation.trim().split(/\r?\n/u).some(line => JSON.parse(line).type === 'presentation'), false, 'Presentation JSONL must not embed A2UI design');
assert.equal(await readSource(graphAdapter.source), presentationSource.presentation, 'Graph must share Presentation semantic JSONL');
assert.equal(await readSource(seqAdapter.source), presentationSource.presentation, 'Seq must share Presentation semantic JSONL');

const controlFeature = JSON.parse(await fs.readFile(path.join(outputRoot, 'adapters', 'control', 'feature.json'), 'utf8'));
const presentationFeature = JSON.parse(await fs.readFile(path.join(outputRoot, 'adapters', 'presentation', 'feature.json'), 'utf8'));
assert.equal(controlFeature.entry, presentationFeature.entry, 'Control and Presentation must use one common A2UI feature entry');
assert.match(controlFeature.entry, /a2ui-browser\/src\/feature-app\.mjs/u);
assert.match(controlFeature.plan, /packages\/control\/model\.mjs/u);
assert.match(presentationFeature.plan, /packages\/presentation\/model\.mjs/u);
const commonFeature = await fs.readFile(path.join(outputRoot, 'modules', 'packages', 'a2ui-browser', 'src', 'feature-app.mjs'), 'utf8');
assert.match(commonFeature, /input\.design/u, 'common feature must consume design from #data');
assert.doesNotMatch(commonFeature, /fetch\([^)]*design\.json/u, 'common feature must not fetch design.json separately');

for (const relative of [
  'packages/semantic-map/authoring/handoff.js',
  'packages/semantic-map/authoring/review.js',
  'packages/semantic-map/authoring/runtime.js',
  'packages/semantic-map/transport/smap-delivery.js',
]) {
  assert.deepEqual(await fs.readFile(path.join(outputRoot, 'modules', relative)), await fs.readFile(path.join(repoRoot, relative)), `${relative}: publication must reuse canonical bytes`);
}
const canonicalApp = await fs.readFile(path.join(outputRoot, 'app', 'index.html'), 'utf8');
assert.match(canonicalApp, /\.\.\/modules\/packages\/semantic-map\/authoring\/index\.js/u);
assert.doesNotMatch(canonicalApp, /@(?:INLINE_IMPORTMAP|PAGE_CONFIG|INITIAL_DOCUMENT|EMBEDDED_NOTICES)/u);

assert.equal(variantRoutes, 8, 'exactly eight chart variant publication routes required');
console.log(JSON.stringify({
  schema: 'ui.feature-data-publication-proof/4',
  status: 'PASS',
  features: adapters.map(adapter => adapter.id),
  chartVariants: chartVariantIds,
  variantRoutes,
  commonA2uiApps: ['control', 'presentation'],
  control: { inputs: Object.keys(controlAdapter.source), claims: claims.length },
  presentation: { inputs: Object.keys(presentationAdapter.source), semanticOnly: true },
}));
