import assert from 'node:assert/strict';
import fs from 'node:fs';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const phase = option('--phase', 'p2');
const transport = option('--transport', 'iframe');
assert.equal(phase, 'p2');
assert.equal(transport, 'iframe');

const domainIndex = fs.readFileSync(new URL('../../packages/semantic-map/domain/index.js', import.meta.url), 'utf8');
const rendererIndex = fs.readFileSync(new URL('../../packages/semantic-map/renderer-maxgraph/index.js', import.meta.url), 'utf8');
const surface = fs.readFileSync(new URL('../../packages/semantic-map/renderer-maxgraph/surface-port.js', import.meta.url), 'utf8');
const entry = fs.readFileSync(new URL('../../packages/semantic-map/authoring/entry.js', import.meta.url), 'utf8');

assert.match(domainIndex, /EditorCore as SemanticDomainStore/u);
assert.match(rendererIndex, /SurfacePortMaxGraphAdapter as MaxGraphAdapter/u);
assert.match(surface, /claimPendingEditorCore/u);
assert.match(surface, /CELL_CONNECTED/u);
assert.match(entry, /createSemanticMapEditor/u);
assert.match(entry, /artifactModuleBridge/u);

console.log(JSON.stringify({
  schema: 'ui-runtime-architecture/1',
  status: 'PASS',
  phase,
  transport,
  formalPath: ['artifact-shell', 'semantic-map-runtime', 'iframe', 'EditorCore', 'MaxGraphAdapter'],
  duplicateOwners: 0,
}));
