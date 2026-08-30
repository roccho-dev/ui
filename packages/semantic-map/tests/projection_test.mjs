import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSemanticMap, parseSemanticMapRecords } from '../domain/index.js';
import {
  MAX_SCENE_PRIMITIVES,
  SemanticProjector,
  createPresentationProjection,
  interactionTargetFor,
  validateSceneGraph,
} from '../projection/index.js';

function load(name) {
  return createSemanticMap(parseSemanticMapRecords(fs.readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8')));
}
function project(domain, view) {
  const projector = new SemanticProjector(domain, null, view);
  return projector.project({ scale: 1, viewport: { x: -100, y: -100, width: 2500, height: 1800 } });
}

const mapDomain = load('example.jsonl');
const graphDomain = load('graph.jsonl');
const seqDomain = load('sequence.jsonl');
const ganttDomain = load('gantt.jsonl');
const chartDomain = load('chart.jsonl');
const mapScene = project(mapDomain, { pattern: 'map/1' });
const graphScene = project(graphDomain, { pattern: 'graph/1' });
const ordinalScene = project(seqDomain, { pattern: 'seq/1', seq: { groupBy: 'actor', axis: 'ordinal' } });
const calendarScene = project(ganttDomain, { pattern: 'seq/1', seq: { groupBy: 'task', axis: 'calendar' } });
const chartScene = project(chartDomain, { pattern: 'chart/1', chart: { type: 'bar-horizontal/1' } });

assert.equal(mapScene.scenes[0].space, 'semantic-2d/1');
assert.equal(graphScene.scenes[0].space, 'topology/1');
assert.equal(ordinalScene.scenes[0].space, 'ordinal/1');
assert.equal(calendarScene.scenes[0].space, 'calendar/1');
assert.equal(chartScene.scenes[0].space, 'quantitative/1');
assert.ok(mapScene.representations.some((item) => item.geometryEditable));
assert.ok(graphScene.representations.filter((item) => !item.isRoot).every((item) => !item.geometryEditable));
assert.ok(ordinalScene.representations.some((item) => item.temporalEdit?.axis === 'ordinal'));
assert.ok(calendarScene.representations.some((item) => item.temporalEdit?.axis === 'calendar'));
const ordinalById = new Map(ordinalScene.representations.map((item) => [item.regionId, item]));
assert.equal(ordinalById.get('request').bounds.y, ordinalById.get('review').bounds.y);
assert.notEqual(ordinalById.get('review').bounds.y, ordinalById.get('accept').bounds.y);
assert.notEqual(ordinalById.get('proposal').bounds.y, ordinalById.get('revise').bounds.y);
assert.equal(
  ordinalScene.representations.filter((item) => ['request', 'review', 'accept'].includes(item.regionId)).length,
  3,
  'one Human lane must express repeated occurrences without duplicating actor identity',
);
assert.equal(chartScene.representations.filter((item) => item.mode === 'bar').length, 4);
assert.ok(chartScene.representations.filter((item) => item.mode === 'bar').every((item) => item.readOnly));
assert.ok(graphScene.relations.every((item) => item.directed && item.line === 'graph'));
assert.ok(ordinalScene.relations.every((item) => item.directed));
assert.deepEqual(validateSceneGraph(graphDomain, null, { pattern: 'graph/1' }), { rootPattern: 'graph/1', scenes: 1 });
assert.equal(MAX_SCENE_PRIMITIVES, 2048, 'MUTATION:change-scene-primitive-limit');

const lodDomain = createSemanticMap([
  { type: 'meta', schema: 'semantic-map-state/1', root: 'organization', title: 'Graph LOD' },
  { type: 'region', id: 'organization', parent: null, label: 'Organization', kind: 'root', bounds: [0, 0, 100, 100], summary: '' },
  { type: 'region', id: 'repo-a', parent: 'organization', label: 'repo-a', kind: 'group', bounds: [0, 0, 100, 100], summary: '' },
  { type: 'region', id: 'repo-b', parent: 'organization', label: 'repo-b', kind: 'group', bounds: [0, 0, 100, 100], summary: '' },
  { type: 'region', id: 'a1', parent: 'repo-a', label: 'a1', kind: 'package', bounds: [0, 0, 100, 100], summary: '' },
  { type: 'region', id: 'a2', parent: 'repo-a', label: 'a2', kind: 'package', bounds: [0, 0, 100, 100], summary: '' },
  { type: 'region', id: 'b1', parent: 'repo-b', label: 'b1', kind: 'package', bounds: [0, 0, 100, 100], summary: '' },
  { type: 'relation', id: 'cross', from: 'a1', to: 'b1', kind: 'depends', label: 'depends' },
]);
const lodProjector = new SemanticProjector(lodDomain, null, { pattern: 'graph/1' });
const lodViewport = { x: -100, y: -100, width: 4000, height: 2600 };
const lodLow = lodProjector.project({ scale: 0.1, viewport: lodViewport });
const lodHigh = lodProjector.project({ scale: 4, viewport: lodViewport });
assert.deepEqual(
  lodLow.representations.map((item) => item.regionId).sort(),
  ['organization', 'repo-a', 'repo-b'],
  'MUTATION:expand-graph-hierarchy-at-all-zooms',
);
assert.equal(lodLow.selectionProxies.a1, 'repo-a');
assert.equal(lodLow.selectionProxies.b1, 'repo-b');
assert.equal(lodLow.relations.length, 1, 'MUTATION:drop-graph-relation-proxy');
assert.equal(lodLow.relations[0].from, 'repo-a');
assert.equal(lodLow.relations[0].to, 'repo-b');
assert.ok(lodHigh.representations.some((item) => item.regionId === 'a1'));
assert.ok(lodHigh.representations.some((item) => item.regionId === 'b1'));
assert.equal(lodHigh.selectionProxies.a1, 'a1');
assert.equal(lodHigh.selectionProxies.b1, 'b1');
assert.equal(lodHigh.relations.length, 1);
assert.equal(lodHigh.relations[0].from, 'a1');
assert.equal(lodHigh.relations[0].to, 'b1');
assert.ok(lodLow.representations.length < lodHigh.representations.length);

const mapBounds = mapDomain.regions.get('request').bounds;
const mapRep = mapScene.representations.find((item) => item.regionId === 'request');
assert.deepEqual(mapRep.bounds, mapBounds, 'map geometry must remain semantic');

const requestProjectedBounds = Object.freeze({
  x: mapBounds.x + 111,
  y: mapBounds.y + 77,
  width: mapBounds.width,
  height: mapBounds.height,
});
const presentationProjection = createPresentationProjection({
  id: 'projection-test/request-shift/1',
  pattern: 'map/1',
  layout: [{ regionId: 'request', bounds: requestProjectedBounds }],
  interactions: [{ regionId: 'request', role: 'node', bounds: requestProjectedBounds, editKinds: ['move'] }],
});
const presentationMapScene = new SemanticProjector(
  mapDomain,
  null,
  { pattern: 'map/1' },
  { presentationProjection },
).project({ scale: 1, viewport: { x: -100, y: -100, width: 2500, height: 1800 } });
assert.deepEqual(
  presentationMapScene.representations.find((item) => item.regionId === 'request').bounds,
  requestProjectedBounds,
  'MUTATION:presentation-layout-overlay',
);
assert.deepEqual(mapDomain.regions.get('request').bounds, mapBounds, 'presentation overlay must not mutate semantic bounds');
const presentationGraphScene = new SemanticProjector(
  mapDomain,
  null,
  { pattern: 'graph/1' },
  { presentationProjection },
).project({ scale: 1, viewport: { x: -100, y: -100, width: 2500, height: 1800 } });
assert.notDeepEqual(
  presentationGraphScene.representations.find((item) => item.regionId === 'request').bounds,
  requestProjectedBounds,
  'MUTATION:presentation-pattern-isolation map presentation projection must not leak into graph/1',
);
assert.deepEqual(interactionTargetFor(presentationProjection, 'request', 'move'), {
  regionId: 'request',
  role: 'node',
  bounds: requestProjectedBounds,
  editKinds: ['move'],
});
assert.equal(interactionTargetFor(presentationProjection, 'request', 'connect'), null);
assert.throws(
  () => createPresentationProjection({
    id: 'projection-test/duplicate/1',
    pattern: 'map/1',
    layout: [
      { regionId: 'request', bounds: requestProjectedBounds },
      { regionId: 'request', bounds: requestProjectedBounds },
    ],
  }),
  /layout regionId values must be unique/u,
);
const unknownProjection = createPresentationProjection({
  id: 'projection-test/unknown/1',
  pattern: 'map/1',
  layout: [{ regionId: 'missing', bounds: requestProjectedBounds }],
});
assert.throws(
  () => new SemanticProjector(mapDomain, null, { pattern: 'map/1' }, { presentationProjection: unknownProjection }).project({
    scale: 1,
    viewport: { x: -100, y: -100, width: 2500, height: 1800 },
  }),
  /layout references unknown region missing/u,
);
const graphBounds = graphDomain.regions.get('request').bounds;
const graphRep = graphScene.representations.find((item) => item.regionId === 'request');
assert.notDeepEqual(graphRep.bounds, graphBounds, 'graph geometry must remain derived');

console.log(JSON.stringify({
  schema: 'semantic-map-projection-test/3',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  scenes: [mapScene.pattern, graphScene.pattern, ordinalScene.pattern, calendarScene.pattern, chartScene.pattern],
  spaces: mapScene.scenes.concat(graphScene.scenes, ordinalScene.scenes, calendarScene.scenes, chartScene.scenes).map((item) => item.space),
  primitiveLimit: MAX_SCENE_PRIMITIVES,
  mapSemanticGeometry: true,
  graphDerivedGeometry: true,
  presentationLayoutOverlay: true,
  presentationInteractionProjection: true,
  graphHierarchyLod: { low: lodLow.representations.length, high: lodHigh.representations.length },
}));
