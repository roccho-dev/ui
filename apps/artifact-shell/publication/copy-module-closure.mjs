import fs from 'node:fs/promises';
import path from 'node:path';

const invariant = (condition, message) => { if (!condition) throw new Error(`module-closure: ${message}`); };
const MODULE_EXTENSIONS = new Set(['.js', '.mjs']);
const SPECIFIER = /(?:\bimport\s+(?:[^'"\n]*?\s+from\s*)?|\bexport\s+(?:[^'"\n]*?\s+from\s*)?|\bimport\s*\()\s*['"](\.[^'"]+)['"]/gu;

const inside = (root, target) => {
  const base = path.resolve(root);
  const resolved = path.resolve(target);
  invariant(resolved === base || resolved.startsWith(`${base}${path.sep}`), `${target} escapes ${root}`);
  return resolved;
};
const specifiers = source => [...source.matchAll(SPECIFIER)].map(match => match[1]);

export const copyModuleClosure = async ({ entry, outputRoot, repoRoot }) => {
  const start = inside(repoRoot, path.join(repoRoot, entry));
  const pending = [start];
  const copied = new Set();
  while (pending.length > 0) {
    const source = pending.pop();
    const relative = path.relative(repoRoot, source);
    if (copied.has(relative)) continue;
    const stat = await fs.stat(source);
    invariant(stat.isFile(), `${relative} must be a file`);
    const target = path.join(outputRoot, 'modules', relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
    copied.add(relative);
    if (!MODULE_EXTENSIONS.has(path.extname(source))) continue;
    const text = await fs.readFile(source, 'utf8');
    for (const specifier of specifiers(text)) {
      const resolved = inside(repoRoot, path.resolve(path.dirname(source), specifier));
      pending.push(resolved);
    }
  }
  return Object.freeze([...copied].sort());
};
