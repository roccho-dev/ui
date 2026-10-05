import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { embeddedNoticesScript, moduleId, packBrowserModules } from './browser-module-closure.mjs';

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
const appEntry = 'packages/semantic-map/authoring/index.js';
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const BROWSER_MODULE_ROOTS = Object.freeze([
  'packages/semantic-map/',
  'packages/data-pin/',
  'packages/core-port/',
  'packages/connectability/',
  'packages/url-module/',
]);

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

const { modules, imports } = await packBrowserModules({ repoRoot, entry: appEntry, roots: BROWSER_MODULE_ROOTS });
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
html = html.replace('<!-- @EMBEDDED_NOTICES -->', await embeddedNoticesScript(packageRoot));
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
  moduleRoots: Object.freeze(BROWSER_MODULE_ROOTS),
  pattern: envelope.view.pattern,
});
await fs.writeFile(path.join(outputRoot, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
