import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');
const expected = path.join(repoRoot, 'examples', 'render.semantic-map', 'dist');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'semantic-map-example-'));

const run = (command, args, options) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.once('error', reject);
  child.once('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
});

const heartbeat = setInterval(() => {
  console.log(JSON.stringify({ schema: 'ci-heartbeat/1', task: 'semantic-map-example-reproducibility', status: 'RUNNING' }));
}, 15_000);

try {
  const result = await run(
    process.execPath,
    [path.join(packageRoot, 'scripts', 'build-browser-example.mjs'), `--out=${temporary}`],
    { cwd: repoRoot },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout || `signal=${String(result.signal)}`);
  for (const name of ['index.html', 'receipt.json']) {
    assert.deepEqual(await fs.readFile(path.join(temporary, name)), await fs.readFile(path.join(expected, name)), `${name} is stale`);
  }
  console.log(JSON.stringify({ schema: 'semantic-map-example-reproducibility/1', status: 'PASS', files: 2 }));
} finally {
  clearInterval(heartbeat);
  await fs.rm(temporary, { recursive: true, force: true });
}
