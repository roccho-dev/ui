import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { featureIds as a2uiFeatureIds } from '../../a2ui-browser/feature.mjs';
import { featureIds as businessFeatureIds } from '../../business-model/feature.mjs';
import { featureIds as semanticFeatureIds } from '../feature.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const resolve = relative => path.join(root, relative);
const read = relative => fs.readFileSync(resolve(relative), 'utf8');
const exists = relative => fs.existsSync(resolve(relative));

const authoring = read('packages/semantic-map/renderer-maxgraph/authoring/index.js');
const rendererIndex = read('packages/semantic-map/renderer-maxgraph/index.js');
const adapter = read('packages/semantic-map/renderer-maxgraph/adapter.js');
const semanticMain = read('packages/semantic-map/authoring/main.js');

const migrated = {
  selection: /setSelection|selectionSnapshot/.test(adapter),
  add: /function addNode\(/.test(semanticMain),
  delete: /deleteSelection/.test(adapter) && /deleteSelection/.test(semanticMain),
  labelEdit: /startEditingSelection/.test(adapter) && /startEditingSelection/.test(semanticMain),
  connect: /ConnectRegions/.test(adapter),
  reconnect: /ReconnectRelation/.test(authoring) && /setCellsDisconnectable\(true\)/.test(authoring),
  move: /MoveRegions/.test(adapter),
  resize: /ResizeRegions/.test(adapter),
  temporalMoveResize: /PlaceTemporalRegions/.test(adapter),
  nudge: /nudgeSelection/.test(authoring) && /ArrowLeft/.test(authoring) && /ArrowRight/.test(authoring),
  undoRedo: /function undo\(/.test(semanticMain) && /function redo\(/.test(semanticMain),
  activeList: /mountActiveList/.test(authoring),
};
for (const [capability, present] of Object.entries(migrated)) assert.equal(present, true, `missing shared authoring capability: ${capability}`);

const retiredPaths = [
  'packages/graph-editor',
  'apps/artifact-shell/adapters',
  'apps/artifact-shell/publication',
  'examples/graph-editor',
  'packages/semantic-map/renderer-maxgraph/authoring/document.js',
  'apps/preview/cases.jsonl',
  'apps/preview/resolve-cases.mjs',
];
for (const relative of retiredPaths) assert.equal(exists(relative), false, `retired graph-editor/preview path still exists: ${relative}`);
assert.doesNotMatch(authoring, /createDocumentAuthoring|\.\/document\.js/);
assert.doesNotMatch(rendererIndex, /createDocumentAuthoring/);

const legacyStandaloneModels = [];
const scanLegacyStandaloneModel = relative => {
  const absolute = resolve(relative);
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) scanLegacyStandaloneModel(child);
    else if (entry.isFile() && /\.js$/u.test(entry.name)) {
      const source = read(child);
      if (/edge\.arrow/u.test(source) && /insertRectangle/u.test(source) && /readCells/u.test(source) && /replaceCells/u.test(source)) legacyStandaloneModels.push(child);
    }
  }
};
scanLegacyStandaloneModel('packages/semantic-map/renderer-maxgraph/authoring');
assert.deepEqual(legacyStandaloneModels, [], `legacy standalone document model was reintroduced: ${legacyStandaloneModels.join(', ')}`);

const previewFeatureIds = [...new Set([...businessFeatureIds, ...semanticFeatureIds, ...a2uiFeatureIds])].sort();
assert.deepEqual(previewFeatureIds, ['chart', 'control', 'graph', 'map', 'presentation', 'seq']);

const runtimeRoots = [
  'apps/artifact-shell/scripts',
  'apps/artifact-shell/src',
  'apps/preview',
];
const runtimeReferences = [];
const scan = relative => {
  const absolute = resolve(relative);
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) scan(child);
    else if (entry.isFile() && /\.(?:css|html|js|json|jsonl|mjs|sh)$/u.test(entry.name) && /graph-editor/u.test(read(child))) runtimeReferences.push(child);
  }
};
for (const relative of runtimeRoots) scan(relative);
assert.deepEqual(runtimeReferences, [], `graph-editor runtime/preview references remain: ${runtimeReferences.join(', ')}`);

console.log(JSON.stringify({
  schema: 'graph-editor-retirement/4',
  status: 'PASS',
  migrated: Object.keys(migrated),
  retiredPaths,
  previewFeatures: previewFeatureIds,
  runtimeReferences: 0,
  legacyStandaloneModels: 0,
  previewRegistry: false,
}));
