import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const roots = [
  'packages/semantic-map',
  'apps/artifact-shell/publication',
  'apps/artifact-shell/tests',
];
const self = 'packages/semantic-map/tests/transport_retirement_test.mjs';
const forbidden = ['#' + 'smap', 'smap' + '-ref', 'Smap', 'SMAP'];
const hits = [];

async function walk(relative) {
  const absolute = path.join(root, relative);
  const entries = await fs.readdir(absolute, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.posix.join(relative.replaceAll('\\', '/'), entry.name);
    if (entry.isDirectory()) {
      if (child.includes('/vendor/')) continue;
      await walk(child);
      continue;
    }
    if (child === self) continue;
    if (/smap/iu.test(child)) hits.push(`${child}: forbidden path`);
    if (!/\.(?:js|mjs|py|html|css|json|md)$/u.test(child)) continue;
    const text = await fs.readFile(path.join(root, child), 'utf8');
    for (const token of forbidden) {
      if (text.includes(token)) hits.push(`${child}: contains ${token}`);
    }
  }
}

for (const relative of roots) await walk(relative);
if (hits.length) throw new Error(`retired semantic URL transport remains:\n${hits.join('\n')}`);
console.log(JSON.stringify({ schema: 'semantic-map-transport-retirement/1', status: 'PASS', roots }));
