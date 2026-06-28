import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(root, 'tests/fixtures/purpose-atlas');
const surfacePath = path.join(fixtureRoot, 'surface.v0.9.jsonl');
const dataPath = path.join(fixtureRoot, 'atlas-data.json');

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}
function loadSurface() {
  return fs.readFileSync(surfacePath, 'utf8').trim().split(/\n+/).map((line) => JSON.parse(line));
}
function edgeId(edge) {
  return edge.id || `${edge.source}__${edge.target}__${edge.kind || 'link'}`;
}
function applyEvent(state, event) {
  state.t = event.t;
  state.lastEvent = event;
  switch (event.type) {
    case 'purpose.set':
      state.currentPurposeId = event.terminal;
      break;
    case 'node.upsert': {
      const node = {...event};
      delete node.type;
      delete node.t;
      delete node.eventId;
      delete node.eventTs;
      delete node.eventSeq;
      const previous = state.nodes[node.id] || {};
      state.nodes[node.id] = {...previous, ...node, status: node.status || previous.status || 'active'};
      break;
    }
    case 'edge.upsert': {
      const edge = {...event};
      delete edge.type;
      delete edge.t;
      delete edge.eventId;
      delete edge.eventTs;
      delete edge.eventSeq;
      state.edges[edgeId(edge)] = {...edge, id: edgeId(edge), status: 'active'};
      break;
    }
    case 'node.obsolete': {
      const id = event.node || event.id;
      if (state.nodes[id]) state.nodes[id].status = 'archived';
      break;
    }
    default:
      break;
  }
}
function replay(data) {
  const state = {t: 0, currentPurposeId: null, nodes: {}, edges: {}, lastEvent: null};
  for (const node of data.base_nodes || []) state.nodes[node.id] = {...node, status: node.status || 'active'};
  for (const edge of data.base_edges || []) state.edges[edgeId(edge)] = {...edge, id: edgeId(edge), status: 'active'};
  for (const event of data.events || []) applyEvent(state, event);
  return state;
}
function countBy(items, key) {
  return items.reduce((acc, item) => {
    acc[item[key] || ''] = (acc[item[key] || ''] || 0) + 1;
    return acc;
  }, {});
}

const surfaceText = fs.readFileSync(surfacePath, 'utf8');
const dataText = fs.readFileSync(dataPath, 'utf8');
const data = JSON.parse(dataText);
const surface = loadSurface();
const document = surface.find((row) => row.updateComponents).updateComponents.components[0].document;
const treeText = JSON.stringify(document.tree);
const css = document.styles.css;
const state = replay(data);
const nodes = Object.values(state.nodes);
const edges = Object.values(state.edges).filter((edge) => state.nodes[edge.source] && state.nodes[edge.target]);
const gaps = nodes.filter((node) => node.kind === 'gap');
const activeGaps = gaps.filter((node) => node.status !== 'archived').map((node) => node.id).sort();
const archivedGaps = gaps.filter((node) => node.status === 'archived').map((node) => node.id).sort();
const kindCounts = countBy(nodes, 'kind');
const eventTypeCounts = countBy(data.events || [], 'type');

assert.equal(surface.length, 2, 'surface fixture must stay as createSurface + updateComponents');
assert.equal(data.projection_header?.projection_id, 'purpose-atlas.route-gap.260628.sdui-graph-restored');
assert.equal(data.projection_header?.selected_objective_id, 'objective.company_sale');
assert.equal(state.currentPurposeId, 'objective.company_sale');
assert.equal((data.events || []).length, 63, 'replay seed must preserve the approved 63-slide proof window');
assert.equal(nodes.length, 34, 'approved repro final node count');
assert.equal(edges.length, 33, 'approved repro final edge count');
assert.deepEqual(activeGaps, ['gap.g5', 'gap.g6', 'gap.g7', 'gap.g8']);
assert.deepEqual(archivedGaps, ['gap.g2', 'gap.g3', 'gap.g4']);
assert.equal(kindCounts.purpose, 1);
assert.equal(kindCounts.milestone, 1);
assert.equal(kindCounts.policy, 1);
assert.equal(kindCounts.ideal, 7);
assert.equal(kindCounts.current, 7);
assert.equal(kindCounts.gap, 7);
assert.equal(kindCounts.work_order, 7);
assert.equal(kindCounts.evidence, 3);
assert.equal(eventTypeCounts['node.upsert'], 33);
assert.equal(eventTypeCounts['edge.upsert'], 19);
assert.equal(eventTypeCounts['edge.batch'], 7);
assert.equal(eventTypeCounts['node.obsolete'], 3);
assert.equal(eventTypeCounts['purpose.set'], 1);

assert.match(treeText, /"port":"atlasStage"/);
assert.match(treeText, /"when":"selectedNode"/);
assert.match(treeText, /"when":"notSelected"/);
assert.match(treeText, /"text":"nodeを選択すると詳細を表示"/);
assert.match(treeText, /"text":"ADRS merge slide · \{\{slide\}\}\/\{\{maxStepPlusOne\}\} · \{\{lastEventLabel\}\}"/);
assert.doesNotMatch(treeText, /"type":"segmented"|onZoomIn|onZoomOut|onTogglePlay/);
assert.match(css, /\.stage\{/);
assert.match(css, /\.panel\{/);
assert.match(css, /\.rail\{/);

const receipt = {
  status: 'purpose-atlas-reproducibility-pass',
  source: 'tests/fixtures/purpose-atlas',
  surfaceSha256: sha256(surfaceText),
  dataSha256: sha256(dataText),
  final: {
    slides: data.events.length,
    nodes: nodes.length,
    edges: edges.length,
    activeGaps,
    archivedGaps,
    kindCounts,
  },
};
console.log(JSON.stringify(receipt, null, 2));
