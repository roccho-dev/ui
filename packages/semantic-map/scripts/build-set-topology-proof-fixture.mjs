import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');
const builder = path.join(packageRoot, 'scripts', 'build-browser-example.mjs');
const input = path.join(repoRoot, 'examples', 'render.semantic-map.set-topology', 'input', 'envelope.json');
const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const index = argument.indexOf('=');
  if (!argument.startsWith('--') || index < 3) throw new Error(`set-topology-proof-fixture: expected --name=value, got ${argument}`);
  return [argument.slice(2, index), argument.slice(index + 1)];
}));
if (!args.out) throw new Error('set-topology-proof-fixture: --out is required');
const outputRoot = path.resolve(repoRoot, args.out);

const build = (profile, out) => {
  const result = spawnSync(process.execPath, [
    builder,
    `--input=${input}`,
    `--out=${out}`,
    '--set-topology-proof=true',
    `--projection-profile=${profile}`,
  ], { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `set-topology ${profile} build failed`);
};

await fs.rm(outputRoot, { recursive: true, force: true });
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'semantic-map-set-topology-proof-'));
try {
  build('horizontal', outputRoot);
  const verticalRoot = path.join(temporary, 'vertical');
  build('vertical', verticalRoot);
  await fs.copyFile(path.join(verticalRoot, 'index.html'), path.join(outputRoot, 'vertical.html'));
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({
  schema: 'semantic-map-set-topology-proof-fixture/1',
  status: 'PASS',
  output: path.relative(repoRoot, outputRoot),
  profiles: ['horizontal', 'vertical'],
  authority: false,
}));
