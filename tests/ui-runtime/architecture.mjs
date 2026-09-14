import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as domain from '../../packages/semantic-map/domain/index.js';
import * as editorCore from '../../packages/semantic-map/editor-core/index.js';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const phase = option('--phase', 'p2');
const transport = option('--transport', 'iframe');
assert.equal(phase, 'p2');
assert.equal(transport, 'iframe');

const ports = fs.readFileSync(new URL('../../packages/semantic-map/editor-core/ports.js', import.meta.url), 'utf8');
const surface = fs.readFileSync(new URL('../../packages/semantic-map/renderer-maxgraph/surface-port.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../../packages/semantic-map/authoring/main.js', import.meta.url), 'utf8');
const entry = fs.readFileSync(new URL('../../packages/semantic-map/authoring/entry.js', import.meta.url), 'utf8');

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
assert.match(ports, /SurfacePort\.onGesture/u);
assert.match(ports, /DocumentPort\.commit/u);
assert.match(ports, /AuthorityPort\.authorize/u);
assert.doesNotMatch(ports, /pendingCores|claimPendingEditorCore|registerPendingEditorCore/u);
assert.doesNotMatch(surface, /new Proxy|claimPendingEditorCore/u);
assert.match(surface, /#inner/u);
assert.match(surface, /#rollback/u);
assert.match(main, /createSemanticMapEditorCore/u);
assert.match(main, /surface:\s*adapter,\s*document:\s*documentPort,\s*authority:\s*authorityPort/u);
assert.doesNotMatch(main, /adapter\.graph|adapter\.setOperationHandler|store\.perform|store\.execute/u);
assert.match(entry, /createSemanticMapEditor/u);

console.log(JSON.stringify({
  schema: 'ui-runtime-architecture/3',
  status: 'PASS',
  phase,
  transport,
  formalPath: ['artifact-shell', 'semantic-map-runtime', 'iframe', 'EditorCore', 'MaxGraphAdapter'],
  publicOwner: 'packages/semantic-map/editor-core/index.js',
  exactPublicExports: expectedEditorCoreExports,
  explicitPorts: ['SurfacePort', 'DocumentPort', 'AuthorityPort'],
  duplicateOwners: 0,
  directGraphAccess: 0,
  globalCoreClaims: 0,
}));
