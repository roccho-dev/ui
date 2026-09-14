import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const rendererIndex = read('packages/semantic-map/renderer-maxgraph/index.js');
const authoringIndex = read('packages/semantic-map/renderer-maxgraph/authoring/index.js');
const documentAuthoring = read('packages/semantic-map/renderer-maxgraph/authoring/document.js');
const activeList = read('packages/semantic-map/renderer-maxgraph/authoring/active-list.js');

assert.match(rendererIndex, /createSemanticAuthoring as createMaxGraphAdapter/);
assert.match(authoringIndex, /createMaxGraphAdapter/);
assert.match(authoringIndex, /mountActiveList/);
assert.match(authoringIndex, /activeList/);
assert.match(authoringIndex, /createDocumentAuthoring/);
assert.match(activeList, /data-maxgraph-active-list|dataset\.maxgraphActiveList/);
assert.match(activeList, /onActivate/);
assert.match(activeList, /ACTIVE_LIST_CSS/);
assert.match(activeList, /style\.textContent = ACTIVE_LIST_CSS/);
assert.doesNotMatch(activeList, /active-list\.css|new URL\(/);
assert.equal(fs.existsSync(path.join(root, 'packages/semantic-map/renderer-maxgraph/authoring/active-list.css')), false);
assert.match(documentAuthoring, /vendor\/maxgraph/);
assert.match(documentAuthoring, /insertRectangle/);
assert.match(documentAuthoring, /deleteSelection/);
assert.match(documentAuthoring, /nudge/);
assert.match(documentAuthoring, /undo/);
assert.match(documentAuthoring, /redo/);

console.log(JSON.stringify({
  schema: 'semantic-map-maxgraph-authoring-boundary-test/4',
  status: 'PASS',
  semanticFeaturesUseAuthoringBoundary: true,
  activeListOwnedByAuthoring: true,
  activeListSelfContained: true,
  documentAuthoringOwnedBySemanticMap: true,
}));
