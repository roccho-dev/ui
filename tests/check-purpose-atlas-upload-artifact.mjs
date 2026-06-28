import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'purpose-atlas-preview-artifact');
const htmlPath = path.join(root, 'dist', 'purpose-atlas-v6-a2ui-ui-refactor.preview.html');
const surfacePath = path.join(root, 'dist', 'a2ui', 'purpose-atlas.surface.jsonl');
const dataPath = path.join(root, 'atlas-data.json');

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}
function mustRead(file) {
  assert.equal(fs.existsSync(file), true, `${file} must exist in uploaded artifact`);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.length > 0, `${file} must be non-empty`);
  return text;
}
function rows(text) {
  return text.trim().split(/\n+/).map((line) => JSON.parse(line));
}
function countBy(items, key) {
  return items.reduce((acc, item) => {
    acc[item[key] || ''] = (acc[item[key] || ''] || 0) + 1;
    return acc;
  }, {});
}
function edgeId(edge) {
  return edge.id || `${edge.source}__${edge.target}__${edge.kind || 'link'}`;
}
function replay(data) {
  const state = {nodes: {}, edges: {}, currentPurposeId: null};
  for (const node of data.base_nodes || []) state.nodes[node.id] = {...node, status: node.status || 'active'};
  for (const edge of data.base_edges || []) state.edges[edgeId(edge)] = {...edge, id: edgeId(edge)};
  for (const event of data.events || []) {
    if (event.type === 'purpose.set') state.currentPurposeId = event.terminal;
    if (event.type === 'node.upsert') {
      const {type, t, ...node} = event;
      state.nodes[node.id] = {...(state.nodes[node.id] || {}), ...node, status: node.status || state.nodes[node.id]?.status || 'active'};
    }
    if (event.type === 'edge.upsert') {
      const {type, t, ...edge} = event;
      state.edges[edgeId(edge)] = {...edge, id: edgeId(edge)};
    }
    if (event.type === 'node.obsolete' && state.nodes[event.node]) state.nodes[event.node].status = 'archived';
  }
  return state;
}
function approvedSurface(surfaceText) {
  const parsedRows = rows(surfaceText);
  assert.equal(parsedRows.length, 2, 'approved surface must stay as createSurface + updateComponents');
  const create = parsedRows.find((row) => row.createSurface).createSurface;
  assert.equal(create.surfaceId, 'purpose-atlas');
  assert.equal(create.catalogId, 'https://visualize-layers.dev/a2ui/catalogs/purpose-atlas/v6-source-ui');
  const component = parsedRows.find((row) => row.updateComponents).updateComponents.components[0];
  assert.equal(component.component, 'A2uiSduiSurface');
  const tree = JSON.stringify(component.document.tree);
  const css = component.document.styles.css;
  for (const token of ['"port":"atlasStage"', '"when":"selectedNode"', '"when":"notSelected"', 'G0閉包: 高価値法人構築と売却', 'nodeを選択すると詳細を表示', 'ADRS merge slide']) {
    assert.ok(tree.includes(token), `approved UI token missing: ${token}`);
  }
  for (const bad of ['"type":"segmented"', 'sdui-shell', 'Purpose Decision Atlas · SDUI']) {
    assert.equal(tree.includes(bad), false, `approved UI must not include ${bad}`);
  }
  for (const token of ['.app{', '.stage{', '.panel{', '.rail{', '.stage-port,.stage-port canvas{position:absolute;inset:0']) {
    assert.ok(css.includes(token), `approved CSS token missing: ${token}`);
  }
  return parsedRows;
}
function approvedData(dataText) {
  const data = JSON.parse(dataText);
  const state = replay(data);
  const nodes = Object.values(state.nodes);
  const edges = Object.values(state.edges).filter((edge) => state.nodes[edge.source] && state.nodes[edge.target]);
  const gaps = nodes.filter((node) => node.kind === 'gap');
  const activeGaps = gaps.filter((node) => node.status !== 'archived').map((node) => node.id).sort();
  const archivedGaps = gaps.filter((node) => node.status === 'archived').map((node) => node.id).sort();
  const kindCounts = countBy(nodes, 'kind');
  assert.equal(data.projection_header?.projection_id, 'purpose-atlas.route-gap.260628.sdui-graph-restored');
  assert.equal((data.events || []).length, 63);
  assert.equal(nodes.length, 34);
  assert.equal(edges.length, 33);
  assert.deepEqual(activeGaps, ['gap.g5', 'gap.g6', 'gap.g7', 'gap.g8']);
  assert.deepEqual(archivedGaps, ['gap.g2', 'gap.g3', 'gap.g4']);
  assert.equal(kindCounts.work_order, 7);
  assert.equal(kindCounts.evidence, 3);
  return {nodes, edges, activeGaps, archivedGaps, kindCounts};
}

const html = mustRead(htmlPath);
const surfaceText = mustRead(surfacePath);
const dataText = mustRead(dataPath);
approvedSurface(surfaceText);
const final = approvedData(dataText);

const surfaceLiteral = html.match(/const __purposeAtlasSurfaceJsonl = ("(?:\\.|[^"\\])*");/s);
assert.ok(surfaceLiteral, 'standalone HTML must embed the A2UI surface JSONL');
assert.equal(JSON.parse(surfaceLiteral[1]), surfaceText, 'uploaded standalone HTML must embed the exact uploaded A2UI surface');

for (const token of [
  '<purpose-atlas-app',
  'purposeAtlasStandaloneFetch',
  'A2uiSduiSurface',
  'a2ui-sdui-surface',
  'purpose-atlas.route-gap.260628.sdui-graph-restored',
  'gap.g8',
  'Receipt: gap.g4 closed',
  'G0閉包: 高価値法人構築と売却',
  'nodeを選択すると詳細を表示',
]) {
  assert.ok(html.includes(token), `uploaded A2UI-built HTML missing ${token}`);
}
for (const bad of ['sdui-shell', 'Purpose Decision Atlas · SDUI', 'source-ui.css']) {
  assert.equal(html.includes(bad), false, `uploaded A2UI-built HTML must not include ${bad}`);
}

const receipt = {
  status: 'purpose-atlas-upload-artifact-approved-ui-pass',
  artifactRoot: root,
  htmlSha256: sha256(html),
  surfaceSha256: sha256(surfaceText),
  dataSha256: sha256(dataText),
  final: {
    nodes: final.nodes.length,
    edges: final.edges.length,
    activeGaps: final.activeGaps,
    archivedGaps: final.archivedGaps,
    kindCounts: final.kindCounts,
  },
};
console.log(JSON.stringify(receipt, null, 2));
