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
const graphEditorBridge = read('packages/graph-editor/src/editor.mjs');

assert.match(rendererIndex, /createSemanticAuthoring as createMaxGraphAdapter/);
assert.match(authoringIndex, /createMaxGraphAdapter as createSemanticAuthoring/);
assert.match(authoringIndex, /createDocumentAuthoring/);
assert.match(documentAuthoring, /vendor\/maxgraph/);
assert.match(documentAuthoring, /insertRectangle/);
assert.match(documentAuthoring, /deleteSelection/);
assert.match(documentAuthoring, /nudge/);
assert.match(documentAuthoring, /undo/);
assert.match(documentAuthoring, /redo/);
assert.doesNotMatch(graphEditorBridge, /vendor\/maxgraph/);
assert.match(graphEditorBridge, /createDocumentAuthoring as createEditor/);

console.log(JSON.stringify({
  schema: 'semantic-map-maxgraph-authoring-boundary-test/1',
  status: 'PASS',
  semanticFeaturesUseAuthoringBoundary: true,
  graphEditorUsesAuthoringBoundary: true,
  directGraphEditorMaxGraphImports: 0,
}));
