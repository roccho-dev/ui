import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
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

const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const atlasInputPath = path.join(repoRoot, 'examples', 'atlas', 'input', 'example.jsonl');
const atlasInputBytes = await fs.readFile(atlasInputPath);
const atlasTempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ui-atlas-example-'));

function buildAtlas(outputRoot) {
  const result = spawnSync(process.execPath, [
    path.join(packageRoot, 'scripts', 'build-browser-example.mjs'),
    '--input=examples/atlas/input/example.jsonl',
    `--out=${outputRoot}`,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

async function readAtlasOutput(outputRoot, atlasReceipt) {
  const htmlBytes = await fs.readFile(path.join(outputRoot, 'index.html'));
  assert.equal(atlasReceipt.schema, 'semantic-map-example-build/1');
  assert.equal(atlasReceipt.status, 'PASS');
  assert.equal(atlasReceipt.pattern, 'graph/1');
  assert.equal(atlasReceipt.input.sha256, sha256(atlasInputBytes));
  assert.equal(atlasReceipt.output.sha256, sha256(htmlBytes));
  assert.equal(atlasReceipt.output.bytes, htmlBytes.byteLength);
  return htmlBytes;
}

async function removeAtlasOutput(outputRoot) {
  const entries = (await fs.readdir(outputRoot)).sort();
  assert.deepEqual(entries, ['index.html', 'receipt.json'], `unexpected Atlas output: ${entries.join(', ')}`);
  await fs.unlink(path.join(outputRoot, 'index.html'));
  await fs.unlink(path.join(outputRoot, 'receipt.json'));
  await fs.rmdir(outputRoot);
}

const firstRoot = path.join(atlasTempRoot, 'first');
const secondRoot = path.join(atlasTempRoot, 'second');
const firstReceipt = buildAtlas(firstRoot);
const secondReceipt = buildAtlas(secondRoot);
const firstHtml = await readAtlasOutput(firstRoot, firstReceipt);
const secondHtml = await readAtlasOutput(secondRoot, secondReceipt);

assert.deepEqual(firstHtml, secondHtml, 'same UI source and Atlas input must generate byte-identical HTML');
assert.deepEqual(firstReceipt, secondReceipt, 'repeat Atlas receipts must be identical');

await removeAtlasOutput(firstRoot);
await removeAtlasOutput(secondRoot);
await fs.rmdir(atlasTempRoot);

console.log(JSON.stringify({
  schema: 'semantic-map-example-reproducibility/2',
  status: 'PASS',
  checkedInDist: false,
  builderProof: receipt.schema,
  atlasWitness: 'exact-jsonl-to-visible-html',
  atlasInputSha256: sha256(atlasInputBytes),
  atlasOutputSha256: firstReceipt.output.sha256,
  atlasOutputBytes: firstReceipt.output.bytes,
  atlasDeterministic: true,
}));
