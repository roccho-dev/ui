import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as domain from '../domain/index.js';
import * as editorCore from '../editor-core/index.js';
import { gestureToOperation, operationToGesture } from '../editor-core/commands.js';

const surfaceSource = fs.readFileSync(new URL('../renderer-maxgraph/surface-port.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../authoring/main.js', import.meta.url), 'utf8');

const expectedEditorCoreExports = [
  'WORKSPACE_SCHEMA',
  'assertAuthorityPort',
  'assertDocumentPort',
  'assertSurfacePort',
  'createSemanticMapEditorCore',
  'createWorkspace',
  'editorDocumentBytes',
  'normalizeSelection',
  'normalizeWorkspace',
  'sameSelection',
  'workspaceBytes',
].sort();

assert.equal(typeof domain.createSemanticMapEditorCore, 'function');
assert.equal(domain.SemanticDomainStore, undefined);
assert.deepEqual(Object.keys(editorCore).sort(), expectedEditorCoreExports);
assert.equal(Object.hasOwn(editorCore, 'EditorCore'), false);
assert.equal(Object.hasOwn(editorCore, 'normalizeOperation'), false);
assert.equal(Object.hasOwn(editorCore, 'operationToGesture'), false);
assert.equal(Object.hasOwn(editorCore, 'MAX_DECISION_OPERATIONS'), false);

const surfacePort = { render() {}, onGesture() {}, snapshot() {}, destroy() {} };
const documentPort = { requestEdit() {}, commit() {}, reload() {}, renderChrome() {} };
const authorityPort = { authorize() {} };
assert.equal(editorCore.assertSurfacePort(surfacePort), surfacePort);
assert.equal(editorCore.assertDocumentPort(documentPort), documentPort);
assert.equal(editorCore.assertAuthorityPort(authorityPort), authorityPort);
assert.throws(
  () => editorCore.assertSurfacePort({ render() {}, snapshot() {}, destroy() {} }),
  /SurfacePort\.onGesture is required/u,
);
assert.throws(
  () => editorCore.assertDocumentPort({ requestEdit() {}, reload() {}, renderChrome() {} }),
  /DocumentPort\.commit is required/u,
);
assert.throws(() => editorCore.assertAuthorityPort({}), /AuthorityPort\.authorize is required/u);

assert.deepEqual(
  operationToGesture({ type: 'ConnectRegions', from: 'a', to: 'b', kind: 'relates', label: '' }),
  { type: 'relation.connect', from: 'a', to: 'b', kind: 'relates', label: '' },
);
assert.deepEqual(
  gestureToOperation({ type: 'relation.connect', from: 'a', to: 'b', kind: 'relates', label: '' }),
  { type: 'ConnectRegions', from: 'a', to: 'b', kind: 'relates', label: '' },
);
assert.deepEqual(
  operationToGesture({ type: 'ReconnectRelation', relationId: 'r1', from: 'a', to: 'c' }),
  { type: 'relation.reconnect', relationId: 'r1', from: 'a', to: 'c' },
);
assert.deepEqual(
  gestureToOperation({ type: 'relation.reconnect', relationId: 'r1', from: 'a', to: 'c' }),
  { type: 'ReconnectRelation', relationId: 'r1', from: 'a', to: 'c' },
);
assert.throws(
  () => gestureToOperation({ type: 'connect-regions', fields: { from: 'a', to: 'b' } }),
  /unsupported gesture connect-regions/u,
);
assert.throws(
  () => gestureToOperation({ type: 'reconnect-relation', relationId: 'r1', from: 'a', to: 'c' }),
  /unsupported gesture reconnect-relation/u,
);

assert.doesNotMatch(surfaceSource, /new Proxy|claimPendingEditorCore|pendingCores/u);
assert.match(surfaceSource, /#inner/u);
assert.match(surfaceSource, /onGesture\(handler\)/u);
assert.match(surfaceSource, /destroy\(\)/u);
assert.match(surfaceSource, /CELL_CONNECTED/u);
assert.match(surfaceSource, /#rollback/u);
assert.match(surfaceSource, /type:\s*'relation\.reconnect'/u);
assert.doesNotMatch(surfaceSource, /type:\s*'reconnect-relation'/u);
assert.match(main, /createSemanticMapEditorCore/u);
assert.match(main, /ports:\s*Object\.freeze\(\{\s*surface:\s*adapter,\s*document:\s*documentPort,\s*authority:\s*authorityPort/u);
assert.doesNotMatch(main, /adapter\.graph|adapter\.setOperationHandler/u);

console.log(JSON.stringify({
  schema: 'semantic-map-surface-port-contract-test/5',
  status: 'PASS',
  canonicalFactory: true,
  exactPublicExports: expectedEditorCoreExports,
  executablePortContracts: true,
  explicitPorts: true,
  pendingGlobalAbsent: true,
  openProxyAbsent: true,
  directGraphAccessAbsent: true,
  canonicalRelationGestures: true,
  legacyRelationGesturesRejected: true,
  reconnectRollbackPresent: true,
}));
