import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readUrlModule } from '../../../packages/url-module/src/index.mjs';
import { buildArtifactShellPublication } from '../src/publication.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const repoRoot = path.resolve(appRoot, '../..');
const tempRoot = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'feature-data-publication-'));
const outputRoot = path.join(tempRoot, 'publication');

await buildArtifactShellPublication({
  capabilitiesRoot: path.join(appRoot, 'capabilities'),
  outputRoot,
  repoRoot,
});

const launcher = await fs.readFile(path.join(outputRoot, 'index.html'), 'utf8');
const examples = {
  graph: 'examples/graph/example.jsonl',
  map: 'examples/map/example.jsonl',
  seq: 'examples/seq/example.jsonl',
  presentation: 'examples/presentation/example.json',
  control: 'examples/control/example.jsonl',
};

for (const [id, sourcePath] of Object.entries(examples)) {
  const match = launcher.match(new RegExp(`href="(adapters/${id}/#data=[^"]+)"`, 'u'));
  assert.ok(match, `${id}: explicit #data launcher link required`);
  const decoded = await readUrlModule({ fragment: 'data', input: new URL(match[1], 'https://artifact-shell.invalid/').href });
  const source = sourcePath.endsWith('.jsonl')
    ? await fs.readFile(path.join(repoRoot, sourcePath), 'utf8')
    : JSON.parse(await fs.readFile(path.join(repoRoot, sourcePath), 'utf8'));
  assert.deepEqual(decoded, source, `${id}: #data must preserve example input`);
  await assert.rejects(
    () => fs.access(path.join(outputRoot, 'adapters', id, 'input.json')),
    { code: 'ENOENT' },
    `${id}: input.json must not be published`,
  );
  const host = await fs.readFile(path.join(outputRoot, 'adapters', id, 'host.mjs'), 'utf8');
  assert.match(host, /#data required/u);
  assert.doesNotMatch(host, /input\.json|searchParams|http-resource/u);
}

console.log(JSON.stringify({ schema: 'ui.feature-data-publication-proof/1', status: 'PASS', features: Object.keys(examples) }));
