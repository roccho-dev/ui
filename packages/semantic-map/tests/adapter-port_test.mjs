import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as domain from '../domain/index.js';
import * as editorCore from '../editor-core/index.js';

const ports = fs.readFileSync(new URL('../editor-core/ports.js', import.meta.url), 'utf8');
const surface = fs.readFileSync(new URL('../renderer-maxgraph/surface-port.js', import.meta.url), 'utf8');
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
assert.doesNotMatch(ports, /pendingCores|claimPendingEditorCore|registerPendingEditorCore/u);
assert.match(ports, /SurfacePort\.onGesture/u);
assert.match(ports, /DocumentPort\.requestEdit/u);
assert.match(ports, /AuthorityPort\.authorize/u);
assert.doesNotMatch(surface, /new Proxy|claimPendingEditorCore|pendingCores/u);
assert.match(surface, /#inner/u);
assert.match(surface, /onGesture\(handler\)/u);
assert.match(surface, /destroy\(\)/u);
assert.match(surface, /CELL_CONNECTED/u);
assert.match(surface, /#rollback/u);
assert.match(main, /createSemanticMapEditorCore/u);
assert.match(main, /ports:\s*Object\.freeze\(\{\s*surface:\s*adapter,\s*document:\s*documentPort,\s*authority:\s*authorityPort/u);
assert.doesNotMatch(main, /adapter\.graph|adapter\.setOperationHandler/u);

console.log(JSON.stringify({
  schema: 'semantic-map-surface-port-contract-test/3',
  status: 'PASS',
  canonicalFactory: true,
  exactPublicExports: expectedEditorCoreExports,
  explicitPorts: true,
  pendingGlobalAbsent: true,
  openProxyAbsent: true,
  directGraphAccessAbsent: true,
  reconnectRollbackPresent: true,
}));
