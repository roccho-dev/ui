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

assert.match(rendererIndex, /createSemanticAuthoring as createMaxGraphAdapter/);
assert.match(authoringIndex, /createMaxGraphAdapter/);
assert.match(authoringIndex, /mountActiveList/);
assert.match(authoringIndex, /activeList/);
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
  schema: 'semantic-map-maxgraph-authoring-boundary-test/5',
  status: 'PASS',
  semanticFeaturesUseAuthoringBoundary: true,
  activeListOwnedByAuthoring: true,
  activeListSelfContained: true,
  documentAuthoringRetired: true,
}));
