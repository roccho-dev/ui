import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSemanticMap, parseSemanticMapRecords } from '../domain/index.js';
import { createGraphLayout, GRAPH_PATTERN, validatePatternDomain } from '../pattern/index.js';
import { SemanticProjector } from '../projection/index.js';
import { displayedRegionLabel } from '../renderer-maxgraph/labels.js';
import { DEFAULT_THEME } from '../renderer-maxgraph/theme.js';

function load(name) {
  const text = fs.readFileSync(new URL(`../examples/graph/${name}.jsonl`, import.meta.url), 'utf8');
  const domain = createSemanticMap(parseSemanticMapRecords(text));
  validatePatternDomain(domain, GRAPH_PATTERN);
  return domain;
}

function project(domain, scale = 1, viewport = { x: -100, y: -100, width: 2400, height: 1600 }) {
  return new SemanticProjector(domain, null, { pattern: GRAPH_PATTERN }).project({ scale, viewport });
}

const flowDomain = load('flow');
const flow = project(flowDomain);
assert.ok(flow.relations.every((relation) => relation.directed), 'flow relations must be directed');
assert.equal(flow.representations.find((item) => item.sourceRegionId === 'start')?.shape, 'graph-terminal');
assert.equal(flow.representations.find((item) => item.sourceRegionId === 'done')?.shape, 'graph-terminal');
const flowLR = createGraphLayout(flowDomain, { direction: 'LR' });
const flowTB = createGraphLayout(flowDomain, { direction: 'TB' });
assert.equal(flowLR.direction, 'LR');
assert.equal(flowTB.direction, 'TB');
assert.ok(flowLR.bounds.get('start').x < flowLR.bounds.get('review').x, 'LR must advance ranks on x');
assert.ok(flowTB.bounds.get('start').y < flowTB.bounds.get('review').y, 'TB must advance ranks on y');
assert.throws(() => createGraphLayout(flowDomain, { direction: 'diagonal' }), /unsupported direction/u);

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

const adr344 = project(load('adr344'), 1, { x: -100, y: -100, width: 6000, height: 4000 });
for (const id of ['meaning', 'phases', 'results', 'fact', 'claim', 'candidate', 'missing']) {
  assert.ok(adr344.representations.some((item) => item.sourceRegionId === id), `ADR #344 must render ${id}`);
}
assert.ok(
  adr344.relations.some((relation) => relation.id === 'r4' && relation.from === relation.to),
  'ADR #344 Claim self relation must survive',
);

const architecture = project(load('architecture-nested'));
for (const id of ['ui.request', 'ui.result', 's3.input', 's3.output', 'dev.process', 'dev.constraints', 'dev.contract']) {
  assert.ok(architecture.representations.some((item) => item.sourceRegionId === id), `overview must show nested ${id}`);
}
const architectureColumns = ['ui', 's3', 'dev'].map((id) => architecture.representations.find((item) => item.sourceRegionId === id));
assert.ok(architectureColumns.every(Boolean), 'architecture groups must render');
assert.ok(
  architectureColumns[0].bounds.x < architectureColumns[1].bounds.x
    && architectureColumns[1].bounds.x < architectureColumns[2].bounds.x,
  'cyclic architecture must preserve ordered columns',
);
const writesOutput = architecture.relations.find((relation) => relation.id === 'a3');
assert.equal(writesOutput?.directed, true);
assert.equal(writesOutput?.from, 'dev.process');
assert.equal(writesOutput?.to, 's3.output');
assert.equal(writesOutput?.label, 'writes output.json');
const readsResult = architecture.relations.find((relation) => relation.id === 'a4');
assert.equal(readsResult?.directed, true);
assert.equal(readsResult?.from, 's3.output');
assert.equal(readsResult?.to, 'ui.result');
assert.equal(readsResult?.label, 'reads result');

console.log(JSON.stringify({
  schema: 'semantic-map-graph-semantics-test/1',
  status: 'PASS',
  pass: true,
  complete: true,
  pattern: GRAPH_PATTERN,
  layouts: ['LR', 'TB'],
  examples: ['flow', 'state', 'class', 'erd', 'subgraph', 'self-loop', 'adr344', 'architecture-nested'],
}));
