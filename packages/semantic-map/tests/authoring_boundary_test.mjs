import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const rendererIndex = read('packages/semantic-map/renderer-maxgraph/index.js');
const authoringIndex = read('packages/semantic-map/renderer-maxgraph/authoring/index.js');
const activeList = read('packages/semantic-map/renderer-maxgraph/authoring/active-list.js');
const semanticGraph = read('packages/semantic-map/renderer-maxgraph/create-semantic-graph.js');
const adapter = read('packages/semantic-map/renderer-maxgraph/adapter.js');
const styles = read('packages/semantic-map/renderer-maxgraph/styles.js');
const featureRuntime = read('packages/semantic-map/feature-runtime.mjs');

assert.match(rendererIndex, /createSemanticAuthoring as createMaxGraphAdapter/);
assert.match(authoringIndex, /createMaxGraphAdapter/);
assert.match(authoringIndex, /mountActiveList/);
assert.match(authoringIndex, /activeList/);
assert.match(authoringIndex, /semanticRegionId/);
assert.match(authoringIndex, /sourceRegionId/);
assert.match(semanticGraph, /sourceLabel \?\? getEditingValue/);
assert.match(adapter, /getPlugin\('CellEditorHandler'\)/);
assert.match(adapter, /editingPlugin\?\.editingCell === cell/);
assert.match(adapter, /editingPlugin\?\.textarea\?\.isConnected/);
assert.match(featureRuntime, /setActivationHandler/);
assert.match(featureRuntime, /activation\?\.kind === 'set-view'/);
assert.match(featureRuntime, /view = nextView/);
assert.match(featureRuntime, /view = previousView/);
const vectorSectorStart = styles.indexOf("case 'vector-sector':");
const vectorSectorEnd = styles.indexOf("case 'seq-step':", vectorSectorStart);
assert.ok(vectorSectorStart >= 0 && vectorSectorEnd > vectorSectorStart);
const vectorSectorStyle = styles.slice(vectorSectorStart, vectorSectorEnd);
assert.doesNotMatch(vectorSectorStyle, /(?:fontSize: 0|selectable: false|editable: false|connectable: false|deletable: false)/);
assert.doesNotMatch(rendererIndex, /createDocumentAuthoring/);
assert.doesNotMatch(authoringIndex, /createDocumentAuthoring|\.\/document\.js/);
assert.match(activeList, /data-maxgraph-active-list|dataset\.maxgraphActiveList/);
assert.match(activeList, /onActivate/);
assert.match(activeList, /ACTIVE_LIST_CSS/);
assert.match(activeList, /style\.textContent = ACTIVE_LIST_CSS/);
assert.doesNotMatch(activeList, /active-list\.css|new URL\(/);
assert.equal(fs.existsSync(path.join(root, 'packages/semantic-map/renderer-maxgraph/authoring/active-list.css')), false);
assert.equal(fs.existsSync(path.join(root, 'packages/semantic-map/renderer-maxgraph/authoring/document.js')), false);

console.log(JSON.stringify({
  schema: 'semantic-map-maxgraph-authoring-boundary-test/6',
  status: 'PASS',
  semanticFeaturesUseAuthoringBoundary: true,
  activeListOwnedByAuthoring: true,
  activeListSelfContained: true,
  documentAuthoringRetired: true,
}));
