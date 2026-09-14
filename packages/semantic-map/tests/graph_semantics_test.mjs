import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSemanticMap, parseSemanticMapRecords } from '../domain/index.js';
import { GRAPH_PATTERN, validatePatternDomain } from '../pattern/index.js';
import { SemanticProjector } from '../projection/index.js';
import { displayedRegionLabel } from '../renderer-maxgraph/labels.js';
import { DEFAULT_THEME } from '../renderer-maxgraph/theme.js';

function load(name) {
  const text = fs.readFileSync(new URL(`../examples/graph/${name}.jsonl`, import.meta.url), 'utf8');
  const domain = createSemanticMap(parseSemanticMapRecords(text));
  validatePatternDomain(domain, GRAPH_PATTERN);
  return domain;
}

function project(domain, scale = 1) {
  return new SemanticProjector(domain, null, { pattern: GRAPH_PATTERN }).project({
    scale,
    viewport: { x: -100, y: -100, width: 2400, height: 1600 },
  });
}

const flow = project(load('flow'));
assert.ok(flow.relations.every((relation) => relation.directed), 'flow relations must be directed');
assert.equal(flow.representations.find((item) => item.sourceRegionId === 'start')?.shape, 'graph-terminal');
assert.equal(flow.representations.find((item) => item.sourceRegionId === 'done')?.shape, 'graph-terminal');

const state = project(load('state'));
assert.equal(state.representations.find((item) => item.sourceRegionId === 'initial')?.shape, 'graph-terminal');
assert.equal(state.representations.find((item) => item.sourceRegionId === 'final')?.shape, 'graph-terminal');
assert.ok(state.relations.every((relation) => relation.kind === 'transition' && relation.directed));

const classScene = project(load('class'));
const user = classScene.representations.find((item) => item.sourceRegionId === 'user');
assert.ok(user, 'class region must render');
assert.match(user.label, /id: UUID/u);
assert.match(user.label, /email: string/u);
assert.ok(user.bounds.height > 92, 'structured class region must reserve rows for internal items');
assert.ok(!classScene.representations.some((item) => item.sourceRegionId === 'user.id'), 'attributes render inside their owner region');
assert.equal(classScene.selectionProxies['user.id'], user.regionId, 'attribute selection must proxy to its owner region');
const classAssociation = classScene.relations.find((relation) => relation.id === 'c1');
assert.equal(classAssociation?.directed, false, 'class association must be undirected');
assert.equal(classAssociation?.label, '1 owns 0..*');
assert.match(displayedRegionLabel(user, 1, DEFAULT_THEME, false), /email: string/u, 'renderer must keep multiline structured labels visible');

const erd = project(load('erd'));
const customer = erd.representations.find((item) => item.sourceRegionId === 'customer');
assert.match(customer?.label ?? '', /id: UUID PK/u);
const erdRelation = erd.relations.find((relation) => relation.id === 'e1');
assert.equal(erdRelation?.directed, false, 'ER relationship must be undirected');
assert.match(erdRelation?.label ?? '', /0\.\.\*/u, 'cardinality remains semantic relation text');

const subgraphDomain = load('subgraph');
const subgraphOverview = project(subgraphDomain);
const backend = subgraphOverview.representations.find((item) => item.sourceRegionId === 'backend');
assert.equal(backend?.shape, 'boundary');
assert.equal(backend?.hasChildren, true);
assert.ok(subgraphOverview.representations.some((item) => item.sourceRegionId === 'worker'), 'graph overview must reveal useful group contents at scale 1');
assert.ok(subgraphOverview.relations.some((relation) => relation.id === 'g2' && relation.directed));
const subgraphLow = project(subgraphDomain, 0.1);
assert.ok(!subgraphLow.representations.some((item) => item.sourceRegionId === 'worker'), 'low zoom must preserve graph LOD collapse');

const selfLoop = project(load('self-loop'));
const selfRelation = selfLoop.relations.find((relation) => relation.id === 'self-depends');
assert.ok(selfRelation, 'semantic self relation must survive projection');
assert.equal(selfRelation.from, selfRelation.to, 'self relation must remain a loop');
assert.equal(selfRelation.directed, true);
assert.equal(selfRelation.foreground, true, 'self loop must render above its own vertex');
const selfClaim = selfLoop.representations.find((item) => item.sourceRegionId === 'claim');
assert.match(displayedRegionLabel(selfClaim, 1, DEFAULT_THEME, false), /Claim/u, 'structured self-loop node label must remain visible');
assert.match(displayedRegionLabel(selfClaim, 1, DEFAULT_THEME, false), /role: proposal \| decision/u, 'structured self-loop rows must remain visible');
assert.match(displayedRegionLabel(selfClaim, 1, DEFAULT_THEME, false), /required_dependencies/u, 'long structured rows must remain renderable via wrapping');
assert.equal(displayedRegionLabel(selfClaim, 0.35, DEFAULT_THEME, false), 'Claim', 'low fitted scale must preserve a multiline node head');
const wrappedSingleLine = { ...selfClaim, label: 'CandidateData', bounds: { ...selfClaim.bounds, width: 180, height: 92 } };
assert.equal(displayedRegionLabel(wrappedSingleLine, 0.4, DEFAULT_THEME, false), 'CandidateData', 'fitted labels may wrap instead of disappearing');

const architecture = project(load('architecture-nested'));
for (const id of ['ui.request', 's3.input', 's3.output', 'dev.process', 'dev.constraints']) {
  assert.ok(architecture.representations.some((item) => item.sourceRegionId === id), `overview must show nested ${id}`);
}

console.log(JSON.stringify({
  schema: 'semantic-map-graph-semantics-test/1',
  status: 'PASS',
  pass: true,
  complete: true,
  pattern: GRAPH_PATTERN,
  examples: ['flow', 'state', 'class', 'erd', 'subgraph', 'self-loop', 'architecture-nested'],
}));
