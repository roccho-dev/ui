import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const audit = JSON.parse(await fs.readFile(path.join(root, 'packages/semantic-map/migration/legacy-audit-summary.json'), 'utf8'));
const migration = JSON.parse(await fs.readFile(path.join(root, 'packages/semantic-map/migration-manifest.json'), 'utf8'));
assert.equal(audit.schema, 'semantic-map-legacy-requirements-audit/1');
assert.equal(audit.requirements, 290);
for (const key of ['missing', 'conflicts', 'unclassifiedPaths', 'unclassifiedAssertions']) assert.equal(audit[key], 0, key);
assert.equal(migration.legacyCommit, '1daa001bf780053f4319e3fb20b4ea9a6e0d0442');
assert.equal(migration.entries.length, 206);
assert.equal(migration.transforms.length, 4);
for (const required of [
  'packages/semantic-map/runtime.js',
  'packages/semantic-map/authoring/index.js',
  'packages/semantic-map/renderer-maxgraph/index.js',
  'packages/semantic-map/LICENSE.maxGraph',
  'apps/artifact-shell/capabilities/render-semantic-map/manifest.json',
  'examples/render.semantic-map/input/envelope.json',
  'examples/render.semantic-map/dist/index.html',
  'apps/artifact-shell/tests/browser-proof.py',
]) await fs.access(path.join(root, required));
console.log(JSON.stringify({
  schema: 'semantic-map-legacy-source-retirement/1',
  status: 'PASS',
  legacyCommit: migration.legacyCommit,
  legacyRequirements: audit.requirements,
  migratedSourceFiles: migration.entries.length,
  intentionalTransforms: migration.transforms.length,
  browserProofs: Object.freeze([
    'packages/semantic-map/tests/browser_example.py',
    'apps/artifact-shell/tests/browser-proof.py',
  ]),
  decision: 'active-legacy-source-removable-after-self-contained-proof',
}));
