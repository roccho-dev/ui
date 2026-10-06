import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');
const checkedDistRoots = [
  path.join(repoRoot, 'examples', 'render.semantic-map', 'dist'),
  path.join(repoRoot, 'examples', 'render.semantic-map.set-topology', 'dist'),
  path.join(repoRoot, 'examples', 'atlas', 'dist'),
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

const atlasOutput = await fs.mkdtemp(path.join(os.tmpdir(), 'ui-atlas-example-'));
try {
  const atlasProof = spawnSync(process.execPath, [
    path.join(packageRoot, 'scripts', 'build-browser-example.mjs'),
    '--input=examples/atlas/input/example.jsonl',
    `--out=${atlasOutput}`,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(atlasProof.status, 0, atlasProof.stderr || atlasProof.stdout);
  const atlasReceipt = JSON.parse(atlasProof.stdout.trim());
  assert.equal(atlasReceipt.schema, 'semantic-map-example-build/1');
  assert.equal(atlasReceipt.status, 'PASS');
  assert.equal(atlasReceipt.pattern, 'graph/1');
  assert.ok(atlasReceipt.output.bytes > 0);
  assert.ok((await fs.stat(path.join(atlasOutput, 'index.html'))).size > 0);
} finally {
  await fs.rm(atlasOutput, { recursive: true, force: true });
}

console.log(JSON.stringify({
  schema: 'semantic-map-example-reproducibility/2',
  status: 'PASS',
  checkedInDist: false,
  builderProof: receipt.schema,
  atlasWitness: 'exact-jsonl-to-visible-html',
}));
