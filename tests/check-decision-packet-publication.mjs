import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(root, 'packages', 'decision-packet');
const shellSource = await Promise.all((await fs.readdir(path.join(root, 'apps', 'artifact-shell', 'src')))
  .filter(file => file.endsWith('.mjs'))
  .map(async file => [file, await fs.readFile(path.join(root, 'apps', 'artifact-shell', 'src', file), 'utf8')]));
for (const [file, source] of shellSource) {
  assert.equal(source.includes('decision-packet'), false, `${file} contains decision-packet domain meaning`);
  assert.equal(source.includes('Public Decision Packet'), false, `${file} contains product copy`);
}

const packageFiles = [];
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(target);
    else packageFiles.push(path.relative(packageRoot, target));
  }
}
await walk(packageRoot);
assert.equal(packageFiles.some(file => file.endsWith('.html') || file.endsWith('.css')), false, 'decision-packet package must not own a second visual implementation');
assert.equal(packageFiles.includes('runtime.js'), true);
assert.equal(packageFiles.includes('projection/to-semantic-map.js'), true);

const engine = await fs.readFile(path.join(root, 'apps', 'artifact-shell', 'capabilities', 'render-decision-packet', 'engine.mjs'), 'utf8');
assert.equal(engine.includes("packageId: 'decision-packet'"), true);
assert.equal(engine.includes('<style'), false);
assert.equal(engine.includes('<html'), false);
assert.ok(engine.split('\n').length < 45, 'capability engine is not thin');

const exampleRoot = path.join(root, 'examples', 'render.decision-packet');
const input = await fs.readFile(path.join(exampleRoot, 'input', 'decision-packet.json'));
const agent = await fs.readFile(path.join(exampleRoot, 'dist', 'agent.json'));
assert.deepEqual(agent, input, 'human and agent examples must identify the same packet bytes');
const receipt = JSON.parse(await fs.readFile(path.join(exampleRoot, 'dist', 'receipt.json'), 'utf8'));
assert.equal(receipt.generatedArtifactsAreAuthority, false);
assert.equal(receipt.packet.digest, JSON.parse(input).packet_digest);

const manifest = (await fs.readFile(path.join(exampleRoot, 'dist', 'MANIFEST.sha256'), 'utf8')).trim().split('\n');
for (const line of manifest) {
  const [digest, file] = line.split('  ');
  const bytes = await fs.readFile(path.join(exampleRoot, 'dist', file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), digest, file);
}
const readme = await fs.readFile(path.join(root, 'README.md'), 'utf8');
assert.equal(readme.includes('`render.decision-packet@1`'), true);
assert.equal(readme.includes('`render.semantic-map@1`'), true);
console.log(JSON.stringify({ schema: 'decision-packet-publication-boundary/1', status: 'PASS', packageFiles: packageFiles.length, manifestFiles: manifest.length }));
