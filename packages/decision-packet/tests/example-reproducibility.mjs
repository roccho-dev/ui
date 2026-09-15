import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDecisionPacketExample } from '../scripts/build-example.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const inputPath = path.join(repoRoot, 'examples', 'render.decision-packet', 'input', 'decision-packet.json');
const expectedRoot = path.join(repoRoot, 'examples', 'render.decision-packet', 'dist');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'decision-packet-repro-'));

async function snapshot(root) {
  const result = {};
  for (const file of (await fs.readdir(root)).sort()) result[file] = await fs.readFile(path.join(root, file));
  return result;
}

const heartbeat = setInterval(() => {
  console.log(JSON.stringify({ schema: 'ci-heartbeat/1', task: 'decision-packet-example-reproducibility', status: 'RUNNING' }));
}, 15_000);

try {
  const actual = path.join(temporary, 'actual');
  await buildDecisionPacketExample({ inputPath, outputRoot: actual });
  const actualSnapshot = await snapshot(actual);
  assert.deepEqual(actualSnapshot, await snapshot(expectedRoot));
  console.log(JSON.stringify({ schema: 'decision-packet-example-reproducibility/1', status: 'PASS', files: Object.keys(actualSnapshot).length }));
} finally {
  clearInterval(heartbeat);
  await fs.rm(temporary, { recursive: true, force: true });
}
