import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../renderer-maxgraph/index.js', import.meta.url), 'utf8');
const port = fs.readFileSync(new URL('../renderer-maxgraph/surface-port.js', import.meta.url), 'utf8');
const raw = fs.readFileSync(new URL('../renderer-maxgraph/adapter.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../authoring/main.js', import.meta.url), 'utf8');

assert.match(index, /SurfacePortMaxGraphAdapter as MaxGraphAdapter/u);
assert.match(port, /claimPendingEditorCore/u);
assert.match(port, /core\.acceptGesture/u);
assert.match(port, /InternalEvent\.CELL_CONNECTED/u);
assert.match(port, /ReconnectRelation|reconnect-relation/u);
assert.doesNotMatch(port, /new SemanticDomainStore/u);
assert.doesNotMatch(raw, /UndoManager/u);
assert.match(raw, /vendor\/maxgraph/u);
assert.match(main, /from '\.\.\/domain\/index\.js'/u);
assert.match(main, /from '\.\.\/renderer-maxgraph\/index\.js'/u);

console.log(JSON.stringify({
  schema: 'semantic-map-surface-port-contract-test/1',
  status: 'PASS',
  coreOwner: true,
  maxGraphAdapter: true,
  reconnectGesture: true,
  undoManagerAbsent: true,
}));
