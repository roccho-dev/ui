import assert from 'node:assert/strict';
import { makeRepoMapFixtureJsonl, parseJsonl, snapshotRecordsToCrudEvents, reduceModelGraph, projectGraph } from '../packages/a2ui-adapter-artifacts/repo-map-svgpanzoom/src/core.mjs';

const records = parseJsonl(makeRepoMapFixtureJsonl());
const graph = reduceModelGraph(snapshotRecordsToCrudEvents(records));
assert.deepEqual(graph.contract.invariant, ['repo = packages[]', 'package = models[]']);
assert.equal(graph.repos.length, 10);
assert.equal(graph.packages.length, 50);
assert.equal(graph.models.length, 50);
for (const repo of graph.repos) {
  assert.ok(Array.isArray(repo.packages));
  assert.ok(repo.packages.every((pkg) => pkg.container === repo.id));
}
for (const pkg of graph.packages) {
  assert.ok(Array.isArray(pkg.models));
  assert.ok(pkg.models.every((model) => model.container === pkg.id));
}
const z0 = projectGraph(graph, { z: 0, focusId: 'repo:repo-04' });
const z42 = projectGraph(graph, { z: 42, focusId: 'repo:repo-04' });
const z80 = projectGraph(graph, { z: 80, focusId: 'pkg:r04-p00' });
assert.equal(countRole(z0, 'repo'), 10);
assert.equal(countRole(z0, 'package'), 0);
assert.equal(countRole(z42, 'repo'), 1);
assert.equal(countRole(z42, 'package'), 5);
assert.equal(countRole(z42, 'model'), 0);
assert.ok(countRole(z80, 'package') >= 1);
assert.ok(countRole(z80, 'model') >= 1);
console.log(JSON.stringify({ status: 'repo-map-svgpanzoom-core-check-pass', records: records.length, repos: graph.repos.length, packages: graph.packages.length, models: graph.models.length, edges: graph.edges.length }, null, 2));
function countRole(view, role) { return view.nodes.filter((node) => node.role === role).length; }
