import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readUrlModule } from '../../../packages/url-module/src/index.mjs';
import { createAdapter as createControlAdapter } from '../adapters/control.mjs';
import { createAdapter as createGraphAdapter } from '../adapters/graph.mjs';
import { createAdapter as createMapAdapter } from '../adapters/map.mjs';
import { createAdapter as createPresentationAdapter } from '../adapters/presentation.mjs';
import { createAdapter as createSeqAdapter } from '../adapters/seq.mjs';
import { buildArtifactShellPublication } from '../src/publication.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const repoRoot = path.resolve(appRoot, '../..');
const tempRoot = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'feature-data-publication-'));
const outputRoot = path.join(tempRoot, 'publication');
const adapters = [createGraphAdapter(), createMapAdapter(), createSeqAdapter(), createPresentationAdapter(), createControlAdapter()];

await buildArtifactShellPublication({
  capabilitiesRoot: path.join(appRoot, 'capabilities'),
  outputRoot,
  repoRoot,
});

const launcher = await fs.readFile(path.join(outputRoot, 'index.html'), 'utf8');
assert.match(launcher, /<body data-mode="launcher">/u, 'launcher mode must exist before JavaScript boot');
assert.match(launcher, /body\[data-mode="launcher"\] #debug/u, 'launcher mode must hide debug controls');

for (const adapter of adapters) {
  const { id, source: sourcePath } = adapter;
  const match = launcher.match(new RegExp(`href="(adapters/${id}/#data=[^"]+)"`, 'u'));
  assert.ok(match, `${id}: explicit #data launcher link required`);
  const decoded = await readUrlModule({ fragment: 'data', input: new URL(match[1], 'https://artifact-shell.invalid/').href });
  const source = sourcePath.endsWith('.jsonl')
    ? await fs.readFile(path.join(repoRoot, sourcePath), 'utf8')
    : JSON.parse(await fs.readFile(path.join(repoRoot, sourcePath), 'utf8'));
  assert.deepEqual(decoded, source, `${id}: #data must preserve adapter source`);
  await assert.rejects(
    () => fs.access(path.join(outputRoot, 'adapters', id, 'input.json')),
    { code: 'ENOENT' },
    `${id}: input.json must not be published`,
  );
  const host = await fs.readFile(path.join(outputRoot, 'adapters', id, 'host.mjs'), 'utf8');
  assert.match(host, /#data required/u);
  assert.doesNotMatch(host, /input\.json|searchParams|http-resource/u);
}

console.log(JSON.stringify({ schema: 'ui.feature-data-publication-proof/1', status: 'PASS', features: adapters.map(adapter => adapter.id) }));
