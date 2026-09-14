import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as domain from '../domain/index.js';

const publicIndex = fs.readFileSync(new URL('../editor-core/index.js', import.meta.url), 'utf8');
const ports = fs.readFileSync(new URL('../editor-core/ports.js', import.meta.url), 'utf8');
const surface = fs.readFileSync(new URL('../renderer-maxgraph/surface-port.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../authoring/main.js', import.meta.url), 'utf8');

assert.equal(typeof domain.createSemanticMapEditorCore, 'function');
assert.equal(domain.SemanticDomainStore, undefined);
assert.doesNotMatch(publicIndex, /export\s*\{[^}]*EditorCore/u);
assert.doesNotMatch(publicIndex, /operationToGesture|normalizeOperation|MAX_DECISION_OPERATIONS/u);
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
  schema: 'semantic-map-surface-port-contract-test/2',
  status: 'PASS',
  canonicalFactory: true,
  explicitPorts: true,
  pendingGlobalAbsent: true,
  openProxyAbsent: true,
  directGraphAccessAbsent: true,
  reconnectRollbackPresent: true,
}));
