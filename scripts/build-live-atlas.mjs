// Builds the Live Agent Organization Atlas as one offline HTML file: the
// production module closure (maxGraph included) as data-URL import map, the
// resolved sample history as inert JSON, and the maxGraph notices.
//
//   node scripts/build-live-atlas.mjs --out=<new directory> [--input=tests/fixtures/live-atlas/history.json]
//   node scripts/build-live-atlas.mjs --consumer=example --out=<new directory> [--input=examples/atlas/input/example.jsonl]
//
// Open <out>/index.html directly (sample) or serve it and add
// ?events=<SSE URL> to consume an external producer (live).
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { embeddedNoticesScript, moduleId, packBrowserModules } from '../packages/semantic-map/scripts/browser-module-closure.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ATLAS_ENTRY = 'packages/control/atlas.mjs';
export const ATLAS_EXAMPLE_ENTRY = 'examples/atlas/entry.mjs';
export const ATLAS_MODULE_ROOTS = Object.freeze([
  'packages/control/',
  'packages/semantic-map/',
  'packages/data-pin/',
  'packages/a2ui-browser/src/',
]);
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

const rowsText = rows => `${rows.map(row => JSON.stringify(row)).join('\n')}\n`;

// Resolves the fixture shorthands into wire envelopes whose channels are {text}.
export const resolveHistory = async (inputPath, root = repoRoot) => {
  const value = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const named = value.rows ?? {};
  const expand = name => {
    const list = named[name];
    if (!Array.isArray(list)) throw new Error(`live-atlas build: unknown row list ${name}`);
    if (typeof list[0] !== 'string') return list;
    const rows = [...expand(list[0])];
    for (const row of list.slice(1)) {
      const index = rows.findIndex(item => item.id === row.id);
      if (index >= 0) rows[index] = row; else rows.push(row);
    }
    return rows;
  };
  const channel = async input => {
    if (typeof input.text === 'string') return { text: input.text };
    if (typeof input.source === 'string') {
      const file = path.resolve(root, input.source);
      if (!file.startsWith(`${root}${path.sep}`)) throw new Error(`live-atlas build: source escapes the repository: ${input.source}`);
      return { text: await fs.readFile(file, 'utf8') };
    }
    if (typeof input.rows === 'string') return { text: rowsText(expand(input.rows)) };
    if (Array.isArray(input.rows)) return { text: rowsText(input.rows) };
    throw new Error('live-atlas build: channel needs text, source or rows');
  };
  const snapshots = [];
  for (const snapshot of value.snapshots) {
    const channels = {};
    for (const [name, input] of Object.entries(snapshot.channels)) channels[name] = await channel(input);
    snapshots.push({ ...snapshot, channels });
  }
  return { kind: value.kind, complete: value.complete, snapshots };
};

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline'; img-src data:; connect-src http: https:; base-uri 'none'; form-action 'none'">
<title>Live Agent Organization Atlas</title>
@IMPORTMAP
</head>
<body>
@INPUT
@NOTICES
@ENTRY
</body>
</html>
`;

export const buildLiveAtlas = async ({ input, out, consumer = 'app' }) => {
  if (!['app', 'example'].includes(consumer)) throw new Error(`live-atlas build: unsupported consumer ${consumer}`);
  const inputPath = path.resolve(repoRoot, input);
  const outputRoot = path.resolve(repoRoot, out);
  const inputBytes = await fs.readFile(inputPath);
  const inputText = inputBytes.toString('utf8');
  const history = consumer === 'app' ? await resolveHistory(inputPath) : null;
  const entry = consumer === 'app' ? ATLAS_ENTRY : ATLAS_EXAMPLE_ENTRY;
  const { modules, imports } = await packBrowserModules({ repoRoot, entry, roots: ATLAS_MODULE_ROOTS });
  const embeddedInput = consumer === 'app'
    ? `<script type="application/json" id="live-atlas-input">${JSON.stringify(history).replaceAll('<', '\\u003c')}</script>`
    : `<script type="application/x-ndjson" id="live-atlas-input">${inputText.replaceAll('<', '\\u003c')}</script>`;
  const bootstrap = consumer === 'app'
    ? `import { startLiveAtlas } from ${JSON.stringify(moduleId(entry))}; startLiveAtlas();`
    : `import ${JSON.stringify(moduleId(entry))};`;
  const parts = {
    '@IMPORTMAP': `<script type="importmap">${JSON.stringify({ imports }).replaceAll('</', '<\\/')}</script>`,
    '@INPUT': embeddedInput,
    '@NOTICES': await embeddedNoticesScript(path.join(repoRoot, 'packages', 'semantic-map')),
    '@ENTRY': `<script type="module">${bootstrap}</script>`,
  };
  // A function replacer keeps `$` sequences in the inserted text literal.
  const html = PAGE.replace(/@IMPORTMAP|@INPUT|@NOTICES|@ENTRY/gu, marker => parts[marker]);
  await fs.mkdir(outputRoot, { recursive: false });
  const htmlBytes = Buffer.from(html);
  await fs.writeFile(path.join(outputRoot, 'index.html'), htmlBytes, { flag: 'wx' });
  const receipt = {
    schema: 'live-atlas-build/1',
    status: 'PASS',
    input: { path: path.relative(repoRoot, inputPath), sha256: sha256(inputBytes) },
    output: { path: 'index.html', bytes: htmlBytes.byteLength, sha256: sha256(htmlBytes) },
    modules: modules.length,
    moduleRoots: ATLAS_MODULE_ROOTS,
    snapshots: history ? history.snapshots.map(item => item.rev) : [],
    authority: false,
  };
  await fs.writeFile(path.join(outputRoot, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return receipt;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(argument => {
    const index = argument.indexOf('=');
    if (!argument.startsWith('--') || index < 3) throw new Error(`expected --name=value, got ${argument}`);
    return [argument.slice(2, index), argument.slice(index + 1)];
  }));
  if (!args.out) throw new Error('live-atlas build: --out=<new directory> is required');
  const consumer = args.consumer ?? 'app';
  const defaultInput = consumer === 'example' ? 'examples/atlas/input/example.jsonl' : 'tests/fixtures/live-atlas/history.json';
  console.log(JSON.stringify(await buildLiveAtlas({ input: args.input ?? defaultInput, out: args.out, consumer })));
}
