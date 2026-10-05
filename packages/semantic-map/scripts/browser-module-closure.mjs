// Packs one checked-in static ESM closure into an import map of data URLs, so a
// page can run from a single HTML file. Each module keeps its own scope; only
// relative specifiers are rewritten to stable `ui:<repo path>` keys.
import fs from 'node:fs/promises';
import path from 'node:path';

const importOrExport = /\b(?:import|export)\s+(?:(?:[^;]*?)\s+from\s+)?(["'])([^"']+)\1/gmu;
const dynamicImport = /\bimport\(\s*(["'])([^"']+)\1\s*\)/gmu;

export const moduleId = relative => `ui:${relative.split(path.sep).join('/')}`;
export const dataUrl = source => `data:text/javascript;charset=utf-8;base64,${Buffer.from(source).toString('base64')}`;

const specifiers = source => {
  const result = [];
  for (const match of source.matchAll(importOrExport)) result.push(match[2]);
  for (const match of source.matchAll(dynamicImport)) result.push(match[2]);
  return result;
};

export const createModuleResolver = roots => (current, specifier) => {
  if (!specifier.startsWith('.')) throw new Error(`external module is forbidden: ${current} -> ${specifier}`);
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(current), specifier));
  if (target.startsWith('../') || target === '..') throw new Error(`module escapes repository: ${current} -> ${specifier}`);
  if (!roots.some(root => target.startsWith(root))) {
    throw new Error(`browser module owner is not allowed: ${current} -> ${target}`);
  }
  if (!target.endsWith('.js') && !target.endsWith('.mjs')) {
    throw new Error(`module must use explicit .js or .mjs: ${current} -> ${specifier}`);
  }
  return target;
};

const discover = async (repoRoot, entry, resolveModule) => {
  const pending = [entry];
  const found = new Set();
  while (pending.length) {
    const relative = pending.pop();
    if (found.has(relative)) continue;
    const source = await fs.readFile(path.join(repoRoot, relative), 'utf8');
    found.add(relative);
    for (const specifier of specifiers(source)) {
      const next = resolveModule(relative, specifier);
      if (!found.has(next)) pending.push(next);
    }
  }
  return [...found].sort();
};

const rewrite = (relative, source, known, resolveModule) => {
  const replaceStatic = (_whole, quote, specifier) => {
    const target = resolveModule(relative, specifier);
    if (!known.has(target)) throw new Error(`missing module: ${relative} -> ${target}`);
    return _whole.replace(`${quote}${specifier}${quote}`, `${quote}${moduleId(target)}${quote}`);
  };
  const replaceDynamic = (_whole, quote, specifier) => {
    const target = resolveModule(relative, specifier);
    if (!known.has(target)) throw new Error(`missing dynamic module: ${relative} -> ${target}`);
    return `import(${quote}${moduleId(target)}${quote})`;
  };
  return source.replace(importOrExport, replaceStatic).replace(dynamicImport, replaceDynamic);
};

// Returns the sorted module list and the import map `imports` object.
export const packBrowserModules = async ({ repoRoot, entry, roots }) => {
  const resolveModule = createModuleResolver(roots);
  const modules = await discover(repoRoot, entry, resolveModule);
  const known = new Set(modules);
  const imports = {};
  for (const relative of modules) {
    const source = await fs.readFile(path.join(repoRoot, relative), 'utf8');
    imports[moduleId(relative)] = dataUrl(rewrite(relative, source, known, resolveModule));
  }
  return { modules, imports };
};

// The vendored maxGraph notices travel inside every page that embeds it.
export const embeddedNoticesScript = async packageRoot => {
  const notices = `${await fs.readFile(path.join(packageRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8')}\n\n${await fs.readFile(path.join(packageRoot, 'LICENSE.maxGraph'), 'utf8')}`;
  return `<script hidden id="embedded-third-party-notices" type="text/plain">\n${notices.replaceAll('</', '<\\/')}\n</script>`;
};
