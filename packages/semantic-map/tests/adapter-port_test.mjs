import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as domain from '../domain/index.js';
import * as editorCore from '../editor-core/index.js';
import { SURFACE_GESTURES, assertSurfaceGesture, gestureToOperation, commandForKey } from '../editor-core/commands.js';

const surfaceSource = fs.readFileSync(new URL('../renderer-maxgraph/surface-port.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../authoring/main.js', import.meta.url), 'utf8');
const expectedEditorCoreExports = [
  'WORKSPACE_SCHEMA', 'assertAuthorityPort', 'assertDocumentPort', 'assertSurfacePort',
  'createSemanticMapEditorCore', 'createWorkspace', 'editorDocumentBytes',
  'normalizeSelection', 'normalizeWorkspace', 'sameSelection', 'workspaceBytes',
].sort();
assert.equal(typeof domain.createSemanticMapEditorCore, 'function');
assert.equal(domain.SemanticDomainStore, undefined);
assert.deepEqual(Object.keys(editorCore).sort(), expectedEditorCoreExports);
for (const name of ['EditorCore', 'normalizeOperation', 'operationToGesture', 'MAX_DECISION_OPERATIONS']) {
  assert.equal(Object.hasOwn(editorCore, name), false);
}
const surfaceCalls = [];
const surfacePort = {
  rawCell: { id: 'must-not-escape' },
  render(value) { assert.equal(this, surfacePort); surfaceCalls.push('render'); return value; },
  onGesture() { assert.equal(this, surfacePort); surfaceCalls.push('onGesture'); return () => surfaceCalls.push('unsubscribe'); },
  destroy() { assert.equal(this, surfacePort); surfaceCalls.push('destroy'); return true; },
};
const documentPort = { requestEdit() {}, commit() {}, reload() {}, renderChrome() {} };
const authorityPort = { authorize() {} };
const checkedSurface = editorCore.assertSurfacePort(surfacePort);
assert.notEqual(checkedSurface, surfacePort);
assert.deepEqual(Object.keys(checkedSurface).sort(), ['destroy', 'onGesture', 'render']);
assert.equal(Object.isFrozen(checkedSurface), true);
assert.equal(checkedSurface.rawCell, undefined);
const surfaceValue = { accepted: true };
assert.equal(checkedSurface.render(surfaceValue), surfaceValue);
const removeSurfaceListener = checkedSurface.onGesture(() => {});
removeSurfaceListener();
assert.equal(checkedSurface.destroy(), true);
assert.deepEqual(surfaceCalls, ['render', 'onGesture', 'unsubscribe', 'destroy']);
assert.equal(editorCore.assertDocumentPort(documentPort), documentPort);
assert.equal(editorCore.assertAuthorityPort(authorityPort), authorityPort);
assert.throws(() => editorCore.assertSurfacePort({ render() {}, destroy() {} }), /SurfacePort\.onGesture is required/u);
assert.throws(() => editorCore.assertDocumentPort({ requestEdit() {}, reload() {}, renderChrome() {} }), /DocumentPort\.commit is required/u);
assert.throws(() => editorCore.assertAuthorityPort({}), /AuthorityPort\.authorize is required/u);
assert.deepEqual(SURFACE_GESTURES, [
  'selection.changed', 'relation.connect', 'relation.reconnect', 'camera.changed', 'activation.requested',
]);
assert.equal(Object.isFrozen(SURFACE_GESTURES), true);
assert.deepEqual(gestureToOperation({ type: 'relation.connect', from: 'a', to: 'b', kind: 'relates', label: '' }),
  { type: 'ConnectRegions', from: 'a', to: 'b', kind: 'relates', label: '' });
assert.deepEqual(gestureToOperation({ type: 'relation.connect', from: 'a', to: 'b', pattern: 'seq/1' }),
  { type: 'ConnectRegions', from: 'a', to: 'b', kind: 'message', label: '' });
assert.deepEqual(gestureToOperation({ type: 'relation.reconnect', relationId: 'r1', from: 'a', to: 'c' }),
  { type: 'ReconnectRelation', relationId: 'r1', from: 'a', to: 'c' });

const records = [
  { type: 'meta', schema: 'semantic-map-state/1', root: 'map', title: 'Gesture boundary' },
  { type: 'region', id: 'map', parent: null, label: 'Map', kind: 'root', bounds: [0, 0, 900, 620], summary: '' },
  ...['a', 'b', 'c'].map((id, index) => ({ type: 'region', id, parent: 'map', label: id,
    kind: 'concept', bounds: [40 + index * 180, 60, 160, 80], summary: '' })),
];
const counts = { authorize: 0, requestEdit: 0, commit: 0, render: 0, chrome: 0, events: 0 };
let allowed = true;
const core = editorCore.createSemanticMapEditorCore({
  semantic: records, revision: 'r0', ports: {
    surface: { render() { counts.render += 1; }, onGesture: () => () => {}, destroy() {} },
    authority: { authorize() { counts.authorize += 1; return { allowed, code: allowed ? 'ALLOW' : 'E_GESTURE_DENIED' }; } },
    document: {
      requestEdit({ operation }) { counts.requestEdit += 1; return { operations: [operation] }; },
      commit({ expectedRevision }) { counts.commit += 1; return { revision: expectedRevision }; },
      reload: ({ input }) => ({ input }), renderChrome() { counts.chrome += 1; },
    },
  },
});
core.subscribe(() => { counts.events += 1; });
const reset = () => { for (const key of Object.keys(counts)) counts[key] = 0; };
reset();
const forbidden = [
  'move-regions', 'resize-regions', 'place-temporal-regions', 'rename-region',
  'set-region-order', 'set-region-value', 'set-region-link', 'set-set-completeness',
  'add-region', 'mount-region-module', 'unmount-region-module', 'remove-selection',
  'selection-changed', 'connect-regions', 'reconnect-relation', 'unknown',
];
for (const type of forbidden) {
  const before = core.snapshot();
  const gesture = { type, regionId: 'a', regionIds: ['a'], relationIds: [], selection: { regionIds: ['a'], relationIds: [] },
    dx: 1, dy: 1, label: 'Must not edit', fields: { from: 'a', to: 'b' } };
  assert.throws(() => core.acceptGesture(gesture), /unsupported gesture/u, type);
  assert.throws(() => assertSurfaceGesture(gesture), /unsupported gesture/u, type);
  assert.deepEqual(core.snapshot(), before);
  assert.deepEqual(Object.values(counts), [0, 0, 0, 0, 0, 0]);
}
for (const value of [null, [], 'selection.changed']) {
  assert.throws(() => core.acceptGesture(value), /gesture is required/u);
}
const selection = { regionIds: ['a'], relationIds: [] };
core.acceptGesture({ type: 'selection.changed', selection });
assert.deepEqual(core.snapshot().selection, selection);
core.acceptGesture({ type: 'camera.changed', presentation: { camera: { scale: 1 } } });
core.acceptGesture({ type: 'activation.requested', activation: { id: 'a' } });
assert.equal(counts.authorize, 0);
assert.equal(counts.commit, 0);
reset();
const connected = core.acceptGesture({ type: 'relation.connect', from: 'a', to: 'b', pattern: 'map/1' });
const relationId = connected.createdRelationId;
assert.equal(core.snapshot().draft.applied, 1);
assert.equal(counts.commit, 1);
assert.equal(counts.events, 1);
reset();
core.acceptGesture({ type: 'relation.reconnect', relationId, from: 'a', to: 'c' });
assert.equal(core.snapshot().records.find(row => row.type === 'relation').id, relationId);
assert.equal(core.snapshot().records.find(row => row.type === 'relation').to, 'c');
assert.equal(core.snapshot().draft.applied, 2);
assert.equal(counts.commit, 1);
assert.equal(counts.events, 1);
core.dispatch({ type: 'history.undo' });
assert.equal(core.snapshot().records.find(row => row.type === 'relation').to, 'b');
core.dispatch({ type: 'history.redo' });
assert.equal(core.snapshot().records.find(row => row.type === 'relation').to, 'c');

let keyboardCases = 0;
const keyCases = [
  [{ key: 'Insert' }, 'node.create'], [{ key: 'n' }, 'node.create'],
  [{ key: 'Enter' }, 'node.edit'], [{ key: 'F2' }, 'node.edit'],
  [{ key: 'z', ctrlKey: true }, 'history.undo'], [{ key: 'z', metaKey: true }, 'history.undo'],
  [{ key: 'Z', ctrlKey: true, shiftKey: true }, 'history.redo'], [{ key: 'y', ctrlKey: true }, 'history.redo'],
  [{ key: 'Delete' }, 'RemoveSelection'], [{ key: 'Backspace' }, 'RemoveSelection'],
  [{ key: 'v' }, 'tool.set'], [{ key: 'h' }, 'tool.set'],
  [{ key: 'o' }, 'link.open'], [{ key: ' ' }, 'tool.hold'], [{ key: 'Escape' }, 'interaction.cancel'],
];
for (const [event, type] of keyCases) {
  assert.equal(commandForKey(event, { selection }).type, type);
  for (const mode of ['editing', 'composition', 'ime229']) {
    assert.equal(commandForKey({ ...event, isComposing: mode === 'composition', keyCode: mode === 'ime229' ? 229 : 0 },
      { selection, editing: mode === 'editing' }), null);
    keyboardCases += 1;
  }
  keyboardCases += 1;
}
for (const [key, x, y] of [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1]]) {
  for (const shiftKey of [false, true]) {
    const step = shiftKey ? 10 : 1;
    const command = commandForKey({ key, shiftKey }, { selection });
    assert.deepEqual(command, { type: 'MoveRegions', regionIds: ['a'], dx: x * step, dy: y * step });
    command.regionIds.push('b');
    assert.deepEqual(selection.regionIds, ['a']);
    keyboardCases += 1;
  }
}
for (const key of ['Insert', 'n', 'Enter', 'F2', ' ']) {
  assert.equal(commandForKey({ key, repeat: true }, { selection }), null);
  keyboardCases += 1;
}
assert.equal(commandForKey({ key: 'ArrowLeft' }, { selection: { regionIds: [], relationIds: [relationId] } }), null);
allowed = false;
reset();
const beforeDeny = core.snapshot();
assert.throws(() => core.dispatch(commandForKey({ key: 'ArrowRight' }, { selection })), /E_GESTURE_DENIED/u);
assert.deepEqual(core.snapshot(), beforeDeny);
assert.equal(counts.authorize, 1);
assert.equal(counts.commit, 0);
assert.equal(counts.events, 0);
core.destroy();

// Supplementary source inventory is not a replacement for execution evidence.
assert.doesNotMatch(surfaceSource, /new Proxy|claimPendingEditorCore|pendingCores|operationToGesture|setOperationHandler/u);
assert.match(surfaceSource, /#inner/u);
assert.match(surfaceSource, /onGesture\(handler\)/u);
assert.match(surfaceSource, /CELL_CONNECTED/u);
assert.match(surfaceSource, /#rollback/u);
assert.match(surfaceSource, /type:\s*'relation\.reconnect'/u);
assert.match(main, /from '\.\.\/editor-core\/index\.js'/u);
assert.match(main, /ports:\s*Object\.freeze\(\{\s*surface:\s*adapter,\s*document:\s*documentPort,\s*authority:\s*authorityPort/u);
assert.doesNotMatch(main, /adapter\.(?:graph|setOperationHandler|submitOperation|deleteSelection|startEditingSelection|selectionSnapshot)\b/u);
const child = spawnSync(process.execPath, ['--experimental-vm-modules',
  fileURLToPath(new URL('./surface-gestures_test.mjs', import.meta.url))], { encoding: 'utf8' });
assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
const receipt = JSON.parse(child.stdout.trim().split(/\r?\n/u).at(-1));
assert.equal(receipt.status, 'PASS');
assert.equal(receipt.schema, 'semantic-map-surface-gestures-test/1');
console.log(JSON.stringify({ schema: 'semantic-map-surface-port-contract-test/6', status: 'PASS',
  exactPublicExports: expectedEditorCoreExports, surfaceGestureTypes: SURFACE_GESTURES,
  rejectedGestureTypes: forbidden.length, keyboardCases, surfaceUnit: receipt,
  publicCoreSixMethodClosure: 'remaining', formalBrowser: false }));
