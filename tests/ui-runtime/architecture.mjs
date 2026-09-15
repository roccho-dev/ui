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

const coreSource = fs.readFileSync(new URL('../../packages/semantic-map/editor-core/core.js', import.meta.url), 'utf8');
const surfaceSource = fs.readFileSync(new URL('../../packages/semantic-map/renderer-maxgraph/surface-port.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../../packages/semantic-map/authoring/main.js', import.meta.url), 'utf8');
const entry = fs.readFileSync(new URL('../../packages/semantic-map/authoring/entry.js', import.meta.url), 'utf8');
const artifactModule = fs.readFileSync(new URL('../../packages/semantic-map/authoring/artifact-module.js', import.meta.url), 'utf8');

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

assert.doesNotMatch(coreSource, /Object\.defineProperty\(api,\s*['"](?:runtime|workspace)['"]|runtimePort\s*\(/u);
assert.match(coreSource, /dispatch:\s*\(command\)[\s\S]*acceptGesture:[\s\S]*replaceInput:[\s\S]*snapshot:[\s\S]*subscribe:[\s\S]*destroy:/u);
assert.doesNotMatch(surfaceSource, /new Proxy|claimPendingEditorCore/u);
assert.match(surfaceSource, /#inner/u);
assert.match(surfaceSource, /#rollback/u);
assert.match(main, /createSemanticMapEditorCore/u);
assert.match(main, /surface:\s*adapter,\s*document:\s*documentPort,\s*authority:\s*authorityPort/u);
assert.doesNotMatch(main, /core\.runtime|core\.workspace|adapter\.graph|adapter\.setOperationHandler|store\.perform|store\.execute/u);
assert.match(entry, /createSemanticMapEditor/u);
assert.doesNotMatch(entry, /adapter\.setActivationHandler/u);
assert.doesNotMatch(artifactModule, /editor\.adapter|editor\.domain/u);

console.log(JSON.stringify({
  schema: 'ui-runtime-architecture/4',
  status: 'PASS',
  phase,
  transport,
  formalPath: ['artifact-shell', 'semantic-map-runtime', 'iframe', 'EditorCore', 'MaxGraphAdapter'],
  publicOwner: 'packages/semantic-map/editor-core/index.js',
  exactPublicExports: expectedEditorCoreExports,
  exactCoreMethods: ['dispatch', 'acceptGesture', 'replaceInput', 'snapshot', 'subscribe', 'destroy'],
  hiddenCoreBypass: 0,
  executablePortContracts: true,
  explicitPorts: ['SurfacePort', 'DocumentPort', 'AuthorityPort'],
  duplicateOwners: 0,
  directGraphAccess: 0,
  globalCoreClaims: 0,
}));
