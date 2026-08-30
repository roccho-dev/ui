import assert from 'node:assert/strict';
import {
  createSemanticMap,
} from '../domain/index.js';
import {
  MAX_MODULE_DEPTH,
  MAX_MODULE_REGIONS,
  MAX_MOUNTED_MODULES,
  ModuleResolver,
} from '../module-embedding/index.js';
import { SemanticProjector } from '../projection/index.js';
import {
  GRAPH_PATTERN,
  MAP_PATTERN,
  SEQ_PATTERN,
  createDecision,
  createDecisionLog,
  createEnvelope,
} from '../protocol/index.js';
import { createSmapUrl } from '../transport/index.js';

function region(id, parent, label, bounds, extra = {}) {
  return {
    type: 'region',
    id,
    parent,
    label,
    kind: extra.kind ?? 'concept',
    bounds,
    summary: extra.summary ?? '',
    ...(extra.temporal ? { temporal: extra.temporal } : {}),
    ...(extra.mount ? { mount: extra.mount } : {}),
  };
}

function meta(root, title) {
  return { type: 'meta', schema: 'semantic-map-state/1', root, title };
}

const VIEWS = Object.freeze({
  [MAP_PATTERN]: Object.freeze({ pattern: MAP_PATTERN }),
  [GRAPH_PATTERN]: Object.freeze({ pattern: GRAPH_PATTERN }),
  [SEQ_PATTERN]: Object.freeze({
    pattern: SEQ_PATTERN,
    seq: Object.freeze({ axis: 'ordinal', groupBy: 'actor' }),
  }),
});

async function smap(records, mapId, view, proposal = null) {
  const log = await createDecisionLog(records, mapId);
  const envelope = await createEnvelope(log.log, proposal, view);
  const absolute = await createSmapUrl(envelope, 'https://example.test/app');
  return Object.freeze({ ...log, absolute, relative: `/app${new URL(absolute).hash}`, view });
}

function childRecords(pattern) {
  if (pattern === MAP_PATTERN) {
    return [
      meta('child-root', 'Map child'),
      region('child-root', null, 'Map child', [0, 0, 500, 360], { kind: 'root' }),
      region('child-a', 'child-root', 'Child A', [40, 80, 160, 100]),
      region('child-b', 'child-root', 'Child B', [280, 80, 160, 100]),
      { type: 'relation', id: 'child-r', from: 'child-a', to: 'child-b', kind: 'flows', label: '' },
    ];
  }
  if (pattern === GRAPH_PATTERN) {
    return [
      meta('child-root', 'Graph child'),
      region('child-root', null, 'Graph child', [0, 0, 500, 360], { kind: 'root' }),
      region('child-a', 'child-root', 'Child A', [40, 80, 160, 100], { kind: 'input' }),
      region('child-b', 'child-root', 'Child B', [280, 80, 160, 100], { kind: 'output' }),
      { type: 'relation', id: 'child-r', from: 'child-a', to: 'child-b', kind: 'flows', label: '' },
    ];
  }
  return [
    meta('child-root', 'Seq child'),
    region('child-root', null, 'Seq child', [0, 0, 620, 380], { kind: 'root' }),
    region('child-actor', 'child-root', 'Agent', [20, 40, 120, 70], { kind: 'actor' }),
    region('child-a', 'child-root', 'Child A', [180, 120, 150, 80], {
      kind: 'task', temporal: { actor: 'child-actor', ordinal: { start: 0, end: 0 } },
    }),
    region('child-b', 'child-root', 'Child B', [380, 120, 150, 80], {
      kind: 'task', temporal: { actor: 'child-actor', ordinal: { start: 1, end: 1 } },
    }),
    { type: 'relation', id: 'child-r', from: 'child-a', to: 'child-b', kind: 'message', label: '' },
  ];
}

function parentRecords(pattern, src) {
  if (pattern === MAP_PATTERN) {
    return [
      meta('root', 'Map parent'),
      region('root', null, 'Map parent', [0, 0, 1000, 700], { kind: 'root' }),
      region('group', 'root', 'Group', [70, 80, 380, 300], { kind: 'group' }),
      region('hidden', 'group', 'Hidden child', [100, 140, 130, 90]),
      region('outside', 'root', 'Outside', [700, 180, 180, 100]),
      region('portal', 'root', 'URL portal', [470, 350, 400, 300], { kind: 'module', mount: { src } }),
      { type: 'relation', id: 'hidden-outside', from: 'hidden', to: 'outside', kind: 'flows', label: '' },
      { type: 'relation', id: 'portal-outside', from: 'portal', to: 'outside', kind: 'opens', label: '' },
    ];
  }
  if (pattern === GRAPH_PATTERN) {
    return [
      meta('root', 'Graph parent'),
      region('root', null, 'Graph parent', [0, 0, 900, 560], { kind: 'root' }),
      region('portal', 'root', 'URL portal', [120, 180, 260, 130], { kind: 'process', mount: { src } }),
      region('outside', 'root', 'Outside', [560, 180, 220, 130], { kind: 'output' }),
      { type: 'relation', id: 'portal-outside', from: 'portal', to: 'outside', kind: 'flows', label: '' },
    ];
  }
  return [
    meta('root', 'Seq parent'),
    region('root', null, 'Seq parent', [0, 0, 900, 560], { kind: 'root' }),
    region('actor', 'root', 'Human', [20, 40, 120, 70], { kind: 'actor' }),
    region('portal', 'root', 'URL portal', [190, 150, 220, 90], {
      kind: 'task', mount: { src }, temporal: { actor: 'actor', ordinal: { start: 0, end: 1 } },
    }),
    region('outside', 'root', 'Outside', [520, 150, 220, 90], {
      kind: 'task', temporal: { actor: 'actor', ordinal: { start: 2, end: 2 } },
    }),
    { type: 'relation', id: 'portal-outside', from: 'portal', to: 'outside', kind: 'message', label: '' },
  ];
}

const children = new Map();
for (const pattern of [MAP_PATTERN, GRAPH_PATTERN, SEQ_PATTERN]) {
  children.set(pattern, await smap(childRecords(pattern), `semantic-map:child:${pattern}`, VIEWS[pattern]));
}

const primaryChild = children.get(SEQ_PATTERN);
const records = parentRecords(MAP_PATTERN, primaryChild.relative);
const domain = createSemanticMap(records);
const resolver = new ModuleResolver();
await assert.rejects(
  resolver.resolve(domain, { mapId: 'semantic-map:parent', head: 'parent-head' }),
  /View must be an object/u,
);
const modules = await resolver.resolve(domain, {
  mapId: 'semantic-map:parent',
  head: 'parent-head',
  view: VIEWS[MAP_PATTERN],
});
assert.equal(modules.moduleCount, 1);
assert.equal(modules.maxDepth, 1);
assert.equal(modules.root.view.pattern, MAP_PATTERN);
assert.equal(modules.root.mounts.get('portal').view.pattern, SEQ_PATTERN, 'MUTATION:pattern-matrix');

const inspectedFirst = await resolver.inspectSource(primaryChild.relative);
const inspectedSecond = await resolver.inspectSource(primaryChild.relative);
assert.equal(inspectedSecond, inspectedFirst, 'MUTATION:mount-source-cache');

const projector = new SemanticProjector(domain, modules, VIEWS[MAP_PATTERN]);
const childNode = modules.root.mounts.get('portal');
const cachedPlan = projector.planForNode(childNode);
const viewport = { x: 0, y: 0, width: 1000, height: 700 };
const low = projector.project({ scale: 0.5, viewport });
const high = projector.project({ scale: 5, viewport });
assert.equal(projector.planForNode(childNode), cachedPlan, 'MUTATION:projection-plan-cache');

const lowPortal = low.representations.find((item) => item.regionId === 'portal');
const highPortal = high.representations.find((item) => item.regionId === 'portal');
assert.ok(lowPortal && highPortal);
assert.equal(lowPortal.representationId, highPortal.representationId, 'MUTATION:stable-host-representation');
assert.equal(lowPortal.shape, highPortal.shape, 'MUTATION:stable-host-representation');
assert.deepEqual(lowPortal.bounds, highPortal.bounds, 'MUTATION:stable-host-representation');
assert.equal(lowPortal.detailsVisible, false, 'MUTATION:expand-mounted-detail-at-all-zooms');
assert.equal(highPortal.detailsVisible, true, 'MUTATION:expand-mounted-detail-at-all-zooms');
assert.ok(!low.representations.some((item) => item.regionId.startsWith('@mount/portal/')));
assert.ok(high.representations.some((item) => item.regionId.startsWith('@mount/portal/')));
assert.ok(high.representations.filter((item) => item.regionId.startsWith('@mount/portal/')).every((item) => item.readOnly));
assert.ok(high.relations.filter((item) => item.sceneId !== 'root').every((item) => item.readOnly));

const lowHiddenRelation = low.relations.find((item) => item.relationIds.includes('hidden-outside'));
assert.equal(lowHiddenRelation, undefined, 'MUTATION:exact-relation-endpoints');
assert.equal(low.selectionProxies.hidden, null, 'MUTATION:exact-relation-endpoints');
const highHiddenRelation = high.relations.find((item) => item.relationIds.includes('hidden-outside'));
assert.ok(highHiddenRelation, 'MUTATION:exact-relation-endpoints');
assert.equal(highHiddenRelation.from, 'hidden', 'MUTATION:exact-relation-endpoints');
assert.equal(highHiddenRelation.to, 'outside', 'MUTATION:exact-relation-endpoints');

const edgePan = projector.project({
  scale: 5,
  viewport: { x: 866, y: 350, width: 500, height: 400 },
});
assert.ok(edgePan.detailIds.includes('portal'), 'MUTATION:pan-stable-detail');
assert.equal(
  edgePan.representations.find((item) => item.regionId === 'portal').representationId,
  lowPortal.representationId,
  'MUTATION:stable-host-representation',
);

await assert.rejects(
  resolver.resolve(domain, { mapId: primaryChild.mapId, head: primaryChild.head, view: VIEWS[MAP_PATTERN] }),
  /module cycle at portal/u,
);

const proposal = await createDecision(primaryChild.head, [
  { type: 'RenameRegion', regionId: 'child-a', label: 'Unaccepted' },
], primaryChild.records);
const proposalEnvelope = await createEnvelope(primaryChild.log, proposal.decision, VIEWS[SEQ_PATTERN]);
const proposalAbsolute = await createSmapUrl(proposalEnvelope, 'https://example.test/app');
const proposalUrl = { relative: `/app${new URL(proposalAbsolute).hash}` };
const proposalDomain = createSemanticMap(parentRecords(MAP_PATTERN, proposalUrl.relative));
await assert.rejects(
  new ModuleResolver().resolve(proposalDomain, { mapId: 'semantic-map:proposal-parent', head: 'head', view: VIEWS[MAP_PATTERN] }),
  /must not contain a Proposal/u,
);

const framed = await smap(
  childRecords(MAP_PATTERN),
  'semantic-map:framed-child',
  { pattern: MAP_PATTERN, frame: { focus: 'child-a', scale: 1.5 } },
);
await assert.rejects(
  new ModuleResolver().resolve(
    createSemanticMap(parentRecords(MAP_PATTERN, framed.relative)),
    { mapId: 'semantic-map:framed-parent', head: 'head', view: VIEWS[MAP_PATTERN] },
  ),
  /View may contain only Pattern configuration/u,
);

await assert.rejects(
  new ModuleResolver({ maxDepth: 0 }).resolve(domain, { mapId: 'semantic-map:parent', head: 'head', view: VIEWS[MAP_PATTERN] }),
  /mount depth exceeds 0/u,
);
await assert.rejects(
  new ModuleResolver({ maxModules: 0 }).resolve(domain, { mapId: 'semantic-map:parent', head: 'head', view: VIEWS[MAP_PATTERN] }),
  /mounted module count exceeds 0/u,
);
await assert.rejects(
  new ModuleResolver({ maxRegions: 3 }).resolve(domain, { mapId: 'semantic-map:parent', head: 'head', view: VIEWS[MAP_PATTERN] }),
  /mounted region count exceeds 3/u,
);

const clippingChild = await smap([
  meta('clip-root', 'Clip child'),
  region('clip-root', null, 'Clip child', [0, 0, 100, 100], { kind: 'root' }),
  region('inside', 'clip-root', 'Inside', [10, 10, 30, 30]),
  region('partial', 'clip-root', 'Partial', [80, 80, 60, 60]),
  region('outside', 'clip-root', 'Outside', [180, 180, 40, 40]),
], 'semantic-map:clip-child', VIEWS[MAP_PATTERN]);
const clippingDomain = createSemanticMap([
  meta('clip-parent', 'Clip parent'),
  region('clip-parent', null, 'Clip parent', [0, 0, 700, 500], { kind: 'root' }),
  region('clip-portal', 'clip-parent', 'Clip host', [120, 90, 320, 260], {
    kind: 'module', mount: { src: clippingChild.relative },
  }),
]);
const clippingModules = await new ModuleResolver().resolve(clippingDomain, {
  mapId: 'semantic-map:clip-parent', head: 'head', view: VIEWS[MAP_PATTERN],
});
const clippingScene = new SemanticProjector(clippingDomain, clippingModules, VIEWS[MAP_PATTERN]).project({
  scale: 10,
  viewport: { x: -100, y: -100, width: 1000, height: 800 },
});
const clippingHost = clippingScene.representations.find((item) => item.regionId === 'clip-portal').bounds;
const clippingMounted = clippingScene.representations.filter((item) => item.regionId.startsWith('@mount/clip-portal/'));
assert.ok(clippingMounted.some((item) => item.sourceRegionId === 'inside'));
assert.ok(clippingMounted.some((item) => item.sourceRegionId === 'partial'));
assert.equal(clippingMounted.some((item) => item.sourceRegionId === 'outside'), false, 'MUTATION:portal-host-clipping');
for (const item of clippingMounted) {
  assert.ok(item.bounds.x >= clippingHost.x - 1e-9, 'MUTATION:portal-host-clipping');
  assert.ok(item.bounds.y >= clippingHost.y - 1e-9, 'MUTATION:portal-host-clipping');
  assert.ok(item.bounds.x + item.bounds.width <= clippingHost.x + clippingHost.width + 1e-9, 'MUTATION:portal-host-clipping');
  assert.ok(item.bounds.y + item.bounds.height <= clippingHost.y + clippingHost.height + 1e-9, 'MUTATION:portal-host-clipping');
}

const patternMatrix = [];
for (const rootPattern of [MAP_PATTERN, GRAPH_PATTERN, SEQ_PATTERN]) {
  for (const childPattern of [MAP_PATTERN, GRAPH_PATTERN, SEQ_PATTERN]) {
    const child = children.get(childPattern);
    const matrixDomain = createSemanticMap(parentRecords(rootPattern, child.relative));
    const matrixModules = await new ModuleResolver().resolve(matrixDomain, {
      mapId: `semantic-map:matrix:${rootPattern}:${childPattern}`,
      head: 'head',
      view: VIEWS[rootPattern],
    });
    const scene = new SemanticProjector(matrixDomain, matrixModules, VIEWS[rootPattern]).project({
      scale: 20,
      viewport: { x: -1000, y: -1000, width: 4000, height: 3000 },
    });
    assert.equal(scene.scenes.find((item) => item.id === 'root').pattern, rootPattern, 'MUTATION:pattern-matrix');
    const mounted = scene.scenes.find((item) => item.id !== 'root');
    assert.ok(mounted, 'MUTATION:pattern-matrix');
    assert.equal(mounted.pattern, childPattern, 'MUTATION:pattern-matrix');
    assert.ok(scene.representations.filter((item) => item.sceneId === mounted.id).every((item) => item.readOnly));
    patternMatrix.push(`${rootPattern}>${childPattern}`);
  }
}
assert.equal(patternMatrix.length, 9, 'MUTATION:pattern-matrix');

const invalidDomain = createSemanticMap(parentRecords(MAP_PATTERN, '/app#smap=not-gzip'));
await assert.rejects(
  new ModuleResolver().resolve(invalidDomain, { mapId: 'semantic-map:invalid', head: 'head', view: VIEWS[MAP_PATTERN] }),
  /invalid gzip payload/u,
);

console.log(JSON.stringify({
  schema: 'semantic-map-module-embedding-test/4',
  pass: true,
  status: 'PASS',
  skipped: false,
  complete: true,
  errors: [],
  limits: { depth: MAX_MODULE_DEPTH, modules: MAX_MOUNTED_MODULES, mountedRegions: MAX_MODULE_REGIONS },
  stableHost: true,
  panStableDetail: true,
  exactRelationEndpoints: true,
  sourceCacheReuse: inspectedSecond === inspectedFirst,
  planCacheReuse: projector.planForNode(childNode) === cachedPlan,
  lowScenes: low.scenes.length,
  highScenes: high.scenes.length,
  mountedReadOnly: true,
  implicitFallback: false,
  portalHostClipping: clippingMounted.length,
  patternMatrix,
  safetyLimits: ['cycle', 'proposal', 'view', 'depth', 'modules', 'regions', 'invalid-token'],
}, null, 2));
