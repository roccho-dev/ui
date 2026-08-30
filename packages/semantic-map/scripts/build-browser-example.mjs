import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');
const exampleRoot = path.join(repoRoot, 'examples', 'render.semantic-map');
const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const index = argument.indexOf('=');
  if (!argument.startsWith('--') || index < 3) throw new Error(`expected --name=value, got ${argument}`);
  return [argument.slice(2, index), argument.slice(index + 1)];
}));
const inputPath = path.resolve(repoRoot, args.input ?? path.join('examples', 'render.semantic-map', 'input', 'envelope.json'));
const outputRoot = path.resolve(repoRoot, args.out ?? path.join('examples', 'render.semantic-map', 'dist'));
const appEntry = 'authoring/index.js';
const importOrExport = /\b(?:import|export)\s+(?:(?:[^;]*?)\s+from\s+)?(["'])([^"']+)\1/gmu;
const dynamicImport = /\bimport\(\s*(["'])([^"']+)\1\s*\)/gmu;
const moduleId = relative => `semantic:${relative.split(path.sep).join('/')}`;
const dataUrl = source => `data:text/javascript;charset=utf-8;base64,${Buffer.from(source).toString('base64')}`;
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

const resolveModule = (current, specifier) => {
  if (!specifier.startsWith('.')) throw new Error(`external module is forbidden: ${current} -> ${specifier}`);
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(current), specifier));
  if (target.startsWith('../') || target === '..') throw new Error(`module escapes semantic-map package: ${current} -> ${specifier}`);
  if (!target.endsWith('.js')) throw new Error(`module must use explicit .js: ${current} -> ${specifier}`);
  return target;
};

const specifiers = source => {
  const result = [];
  for (const match of source.matchAll(importOrExport)) result.push(match[2]);
  for (const match of source.matchAll(dynamicImport)) result.push(match[2]);
  return result;
};

const discover = async entry => {
  const pending = [entry];
  const found = new Set();
  while (pending.length) {
    const relative = pending.pop();
    if (found.has(relative)) continue;
    const target = path.join(packageRoot, relative);
    const source = await fs.readFile(target, 'utf8');
    found.add(relative);
    for (const specifier of specifiers(source)) {
      const next = resolveModule(relative, specifier);
      if (!found.has(next)) pending.push(next);
    }
  }
  return [...found].sort();
};

const rewrite = (relative, source, known) => {
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

const inlineStyle = async (html, href, file, attrs = '') => {
  const marker = `<link rel="stylesheet" href="${href}">`;
  if ((html.split(marker).length - 1) !== 1) throw new Error(`style marker missing/duplicated: ${href}`);
  return html.replace(marker, `<style${attrs}>${await fs.readFile(file, 'utf8')}</style>`);
};

const envelope = JSON.parse(await fs.readFile(inputPath, 'utf8'));
if (envelope.schema !== 'semantic-map-envelope/3') throw new Error('example envelope schema mismatch');
const decision = JSON.parse(envelope.log);
const create = decision.operations?.find(operation => operation.type === 'CreateMap');
if (!create?.records?.length) throw new Error('example envelope does not contain CreateMap records');
const mapId = create.mapId;
const records = create.records;

const modules = await discover(appEntry);
const known = new Set(modules);
const imports = {};
for (const relative of modules) {
  const source = await fs.readFile(path.join(packageRoot, relative), 'utf8');
  imports[moduleId(relative)] = dataUrl(rewrite(relative, source, known));
}
const importMap = JSON.stringify({ imports });

let html = await fs.readFile(path.join(packageRoot, 'authoring', 'pages', 'app.html'), 'utf8');
html = await inlineStyle(html, '../styles/styles.css', path.join(packageRoot, 'authoring', 'styles', 'styles.css'));
html = await inlineStyle(html, '../styles/handoff.css', path.join(packageRoot, 'authoring', 'styles', 'handoff.css'), ' id="semantic-handoff-style"');
html = await inlineStyle(html, '../styles/review.css', path.join(packageRoot, 'authoring', 'styles', 'review.css'), ' id="semantic-review-style"');
html = await inlineStyle(html, '../styles/source.css', path.join(packageRoot, 'authoring', 'styles', 'source.css'), ' id="semantic-source-style"');
html = html.replace('<!-- @INLINE_IMPORTMAP -->', `<script type="importmap">${importMap.replaceAll('</', '<\\/')}</script>`);
html = html.replace('<script type="module" src="../index.js"></script>', `<script type="module">import ${JSON.stringify(moduleId(appEntry))};</script>`);
const setTopologyProof = args['set-topology-proof'] === 'true';
const setTopologyProjectionProfile = args['projection-profile'] ?? 'horizontal';
const config = {
  route: 'app', mode: 'example', title: 'Semantic Map', mapId, view: envelope.view, artifactStore: null,
  ...(setTopologyProof ? { setTopologyProof: true, setTopologyProjectionProfile } : {}),
};
html = html.replace('<!-- @PAGE_CONFIG -->', JSON.stringify(config).replaceAll('</', '<\\/'));
html = html.replace('<!-- @INITIAL_DOCUMENT -->', records.map(record => JSON.stringify(record)).join('\n').replaceAll('</', '<\\/'));
const notices = `${await fs.readFile(path.join(packageRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8')}\n\n${await fs.readFile(path.join(packageRoot, 'LICENSE.maxGraph'), 'utf8')}`;
html = html.replace('<!-- @EMBEDDED_NOTICES -->', `<script hidden id="embedded-third-party-notices" type="text/plain">\n${notices.replaceAll('</', '<\\/')}\n</script>`);
for (const marker of ['@INLINE_IMPORTMAP', '@PAGE_CONFIG', '@INITIAL_DOCUMENT', '@EMBEDDED_NOTICES']) {
  if (html.includes(marker)) throw new Error(`unresolved marker: ${marker}`);
}
await fs.mkdir(outputRoot, { recursive: true });
const htmlBytes = Buffer.from(html.endsWith('\n') ? html : `${html}\n`);
await fs.writeFile(path.join(outputRoot, 'index.html'), htmlBytes);
const inputBytes = await fs.readFile(inputPath);
const receipt = Object.freeze({
  schema: 'semantic-map-example-build/1',
  status: 'PASS',
  input: Object.freeze({ path: 'input/envelope.json', sha256: sha256(inputBytes) }),
  output: Object.freeze({ path: 'dist/index.html', bytes: htmlBytes.byteLength, sha256: sha256(htmlBytes) }),
  modules: modules.length,
  pattern: envelope.view.pattern,
});
await fs.writeFile(path.join(outputRoot, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
