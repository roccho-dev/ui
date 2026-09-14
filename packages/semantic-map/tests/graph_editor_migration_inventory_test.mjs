import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const authoring = read('packages/semantic-map/renderer-maxgraph/authoring/index.js');
const adapter = read('packages/semantic-map/renderer-maxgraph/adapter.js');
const semanticMain = read('packages/semantic-map/authoring/main.js');
const graphEditor = read('packages/graph-editor/src/component.mjs');
const graphEditorBridge = read('packages/graph-editor/src/editor.mjs');

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
for (const [capability, present] of Object.entries(migrated)) assert.equal(present, true, `missing migrated capability: ${capability}`);

assert.match(graphEditorBridge, /createDocumentAuthoring as createEditor/);
assert.doesNotMatch(graphEditorBridge, /vendor\/maxgraph/);

const intentionallyRetired = {
  standaloneDocumentModel: /previous-time|next-time|previous-map|next-map/.test(graphEditor),
  localPersistence: /saveDocument|loadDocument|etag/.test(graphEditor),
  standaloneKeymapShell: /toggleKeymap|keymapList/.test(graphEditor),
};
for (const [capability, documented] of Object.entries(intentionallyRetired)) assert.equal(documented, true, `retirement inventory missing: ${capability}`);

console.log(JSON.stringify({
  schema: 'graph-editor-migration-inventory/2',
  status: 'PASS',
  migrated: Object.keys(migrated),
  intentionallyRetired: Object.keys(intentionallyRetired),
  graphEditorStillPresent: true,
}));
