import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = fs.readFileSync(path.join(root, 'docs/repo-map-read-model-boundary.md'), 'utf8');

for (const term of [
  'repoMap.world.v1',
  'repoMap.lod.v1',
  'repoMap.projection.v1',
  'camera state',
  'ops repoMap projection builder',
  'ui repoMap preview',
  'ui.targetRef.v1',
  'edits queue writer',
  'ops queue runtime',
]) {
  assert.match(doc, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

assert.match(doc, /UI consumes projection artifacts and renders them/);
assert.match(doc, /UI must not write queue rows/);
assert.match(doc, /UI must not perform admission/);
assert.match(doc, /UI must not write accepted ledger rows/);
assert.match(doc, /must not duplicate the source model/);
assert.match(doc, /camera state in the browser/);
assert.match(doc, /non-authority UI state/);

console.log(JSON.stringify({ status: 'repo-map-read-model-boundary-doc-check-pass' }, null, 2));
