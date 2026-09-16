import assert from 'node:assert/strict';
import { createWorkspace, normalizeWorkspace, workspaceBytes } from '../editor-core/index.js';

const records = [
  { type: 'meta', schema: 'semantic-map-state/1', root: 'root', title: 'Codec' },
  { type: 'region', id: 'root', parent: null, label: 'Root', kind: 'root', bounds: [0, 0, 400, 300], summary: '' },
];
const workspace = createWorkspace(records, {
  selection: { regionIds: ['root'], relationIds: [] },
  frame: { pattern: 'map/1' },
});
assert.equal(workspace.schema, 'semantic-map-workspace/1');
assert.deepEqual(normalizeWorkspace(workspace), workspace);
const bytes = workspaceBytes(workspace);
assert.equal(new TextDecoder().decode(bytes).endsWith('\n'), true);
assert.equal(new TextDecoder().decode(bytes).includes('"document"'), true);
assert.equal(new TextDecoder().decode(bytes).includes('"layout"'), true);

console.log(JSON.stringify({
  schema: 'semantic-map-workspace-codec-test/1',
  status: 'PASS',
  rendererNeutral: true,
  documentLayoutSplit: true,
  bytes: bytes.length,
}));
