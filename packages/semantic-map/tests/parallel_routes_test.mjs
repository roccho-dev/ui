import assert from 'node:assert/strict';
import { parallelRoutePoints } from '../renderer-maxgraph/parallel-routes.js';
import { graphViewTypeContract } from '../pattern/view-types/graph/contract.js';
const source = { regionId: 'task', bounds: { x: 40, y: 150, width: 220, height: 92 } };
const target = { regionId: 'monitor', bounds: { x: 560, y: 150, width: 220, height: 92 } };
const relations = [
  { id: 'metrics-up', from: 'task', to: 'monitor', kind: 'metrics', line: 'graph-metrics' },
  { id: 'control-back', from: 'monitor', to: 'task', kind: 'control', line: 'graph-control' },
];
const scene = { scale: 1, representations: [source, target], relations };
const snapshot = JSON.stringify(scene);
for (const scale of [0.25, 0.5, 1, 2]) {
  const routes = parallelRoutePoints({ ...scene, scale });
  const a = routes.get('metrics-up')[0], b = routes.get('control-back')[0];
  assert.ok(Math.abs((a[1] - b[1]) * scale) >= 31.999, 'reciprocal relations need separate visible middle segments');
  assert.deepEqual([...parallelRoutePoints({ ...scene, scale, relations: [...relations].reverse() })].sort(), [...routes].sort(), 'array order cannot swap a relation lane');
}
assert.equal(JSON.stringify(scene), snapshot, 'routes do not mutate semantic input or pins');
assert.deepEqual(parallelRoutePoints({ ...scene, relations: [relations[0]] }).get('metrics-up'), [], 'removing the other relation removes its obsolete bend');
assert.equal(parallelRoutePoints({ ...scene, relations: [{ ...relations[0], to: 'task' }] }).size, 0, 'existing self-loop routing remains separate');
assert.equal(graphViewTypeContract.relationVisual(relations[0]).line, 'graph-metrics');
assert.equal(graphViewTypeContract.relationVisual(relations[1]).line, 'graph-control');
console.log(JSON.stringify({ schema: 'semantic-map-parallel-routes-test/1', status: 'PASS', finite: true }));
