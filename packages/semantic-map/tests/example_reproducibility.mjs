import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');
const expected = path.join(repoRoot, 'examples', 'render.semantic-map', 'dist');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'semantic-map-example-'));
try {
  const run = spawnSync(process.execPath, [path.join(packageRoot, 'scripts', 'build-browser-example.mjs'), `--out=${temporary}`], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  for (const name of ['index.html', 'receipt.json']) {
    assert.deepEqual(await fs.readFile(path.join(temporary, name)), await fs.readFile(path.join(expected, name)), `${name} is stale`);
  }
  console.log(JSON.stringify({ schema: 'semantic-map-example-reproducibility/1', status: 'PASS', files: 2 }));
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
