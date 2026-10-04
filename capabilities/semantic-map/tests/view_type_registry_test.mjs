import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  RESERVED_PATTERNS,
  SUPPORTED_PATTERNS,
  getViewTypeProjection,
  viewTypeRegistryManifest,
} from '../pattern/index.js';

const root = resolve(new URL('..', import.meta.url).pathname);
const directory = resolve(root, 'pattern/view-types');
const modules = readdirSync(directory, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => JSON.parse(readFileSync(resolve(directory, entry.name, 'module.json'), 'utf8')))
  .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
const registry = viewTypeRegistryManifest();

assert.deepEqual(modules.map(item => item.id), registry.map(item => item.id));
assert.deepEqual(modules.filter(item => item.status === 'supported').map(item => item.id), SUPPORTED_PATTERNS);
assert.deepEqual(modules.filter(item => item.status === 'reserved').map(item => item.id), RESERVED_PATTERNS);
for (const [index, module] of modules.entries()) {
  const registered = registry[index];
  assert.equal(module.schema, 'semantic-view-type-module/1');
  assert.equal(module.status, registered.status);
  assert.equal(module.config?.key ?? null, registered.configKey);
  assert.deepEqual(module.capabilities, registered.capabilities);
  assert.equal(module.surface, 'maxgraph');
  assert.equal(getViewTypeProjection(module.id).id, module.id);
}


const chartModule = modules.find(item => item.id === 'chart/1');
assert.deepEqual(chartModule.config.layerTypes, [
  'bar-horizontal/1', 'bar-vertical/1', 'line/1', 'pie/1', 'donut/1', 'scatter/1',
]);
assert.deepEqual(chartModule.config.exclusiveTypes, ['heatmap/1', 'sunburst/1']);
assert.equal(chartModule.config.combinations, 65);

const projector = readFileSync(resolve(root, 'projection/projector.js'), 'utf8');
assert.doesNotMatch(projector, /chart\/1|bar-horizontal\/1|View\.chart/u, 'generic projector must not know chart details');
const renderer = readFileSync(resolve(root, 'renderer-maxgraph/adapter.js'), 'utf8');
assert.doesNotMatch(renderer, /chart\/1|bar-horizontal\/1|scatter\/1|heatmap\/1|chart-bar/u, 'chart proof must reuse existing maxGraph primitives');

console.log(JSON.stringify({
  schema: 'semantic-view-type-registry-test/1',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  types: registry.map(item => item.id),
  registryEntries: registry.length,
  projectorChartBranches: 0,
  rendererChartBranches: 0,
}));
