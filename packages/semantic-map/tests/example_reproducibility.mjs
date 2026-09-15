import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');
const checkedDistRoots = [
  path.join(repoRoot, 'examples', 'render.semantic-map', 'dist'),
  path.join(repoRoot, 'examples', 'render.semantic-map.set-topology', 'dist'),
];

for (const root of checkedDistRoots) {
  await assert.rejects(fs.access(root), undefined, `${path.relative(repoRoot, root)} must not be checked in`);
}

const proof = spawnSync('python3', [path.join(packageRoot, 'tests', 'set_topology_example_reproducibility.py')], {
  cwd: repoRoot,
  encoding: 'utf8',
});
assert.equal(proof.status, 0, proof.stderr || proof.stdout);
const receipt = JSON.parse(proof.stdout.trim());
assert.equal(receipt.schema, 'semantic-map-set-topology-example-reproducibility/2');
assert.equal(receipt.status, 'PASS');
assert.deepEqual(receipt.profiles, ['horizontal', 'vertical']);
assert.equal(receipt.checkedInDist, false);

console.log(JSON.stringify({
  schema: 'semantic-map-example-reproducibility/2',
  status: 'PASS',
  checkedInDist: false,
  builderProof: receipt.schema,
}));
