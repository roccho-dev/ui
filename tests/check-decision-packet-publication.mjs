import assert from 'node:assert/strict';
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

const inputPath = path.join(root, 'examples', 'render.decision-packet', 'input', 'decision-packet.json');
const packet = JSON.parse(await fs.readFile(inputPath, 'utf8'));
assert.equal(packet.schema, 'decision-packet/1');
assert.equal(packet.authority, false);
assert.equal(packet.privacy_class, 'public');
assert.match(packet.packet_digest, /^sha256:[0-9a-f]{64}$/u);
await assert.rejects(
  fs.access(path.join(root, 'examples', 'render.decision-packet', 'dist')),
  undefined,
  'generated decision-packet dist must not be a checked-in publication input',
);

const readme = await fs.readFile(path.join(root, 'README.md'), 'utf8');
assert.equal(readme.includes('`render.decision-packet@1`'), true);
assert.equal(readme.includes('`render.semantic-map@1`'), true);
console.log(JSON.stringify({
  schema: 'decision-packet-publication-boundary/2',
  status: 'PASS',
  packageFiles: packageFiles.length,
  checkedInGeneratedOutputs: false,
}));
