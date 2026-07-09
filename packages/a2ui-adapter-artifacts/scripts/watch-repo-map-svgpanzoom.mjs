import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRepoMapSvgPanZoomArtifact, parseRepoMapBuildArgs } from './build-repo-map-svgpanzoom.mjs';

export function parseRepoMapHotReloadArgs(argv = [], env = process.env) {
  const builderArgv = [];
  const parsedWatch = { host: env.REPO_MAP_SVGPANZOOM_HOST || '127.0.0.1', port: Number(env.REPO_MAP_SVGPANZOOM_PORT || 4178), once: false, watch: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--host') parsedWatch.host = requireValue(argv, ++i, arg);
    else if (arg === '--port') parsedWatch.port = Number(requireValue(argv, ++i, arg));
    else if (arg === '--once') { parsedWatch.once = true; parsedWatch.watch = false; }
    else { builderArgv.push(arg); if (['--out', '--input', '--input-jsonl', '--projection', '--input-projection', '--runtime'].includes(arg)) builderArgv.push(requireValue(argv, ++i, arg)); }
  }
  const builder = parseRepoMapBuildArgs(builderArgv, env);
  const parsed = { ...builder, ...parsedWatch };
  if (!Number.isInteger(parsed.port) || parsed.port <= 0) throw new Error(`invalid repo-map hot reload port: ${parsed.port}`);
  return parsed;
}

export async function buildRepoMapHotReloadPreview(options = {}) {
  const outRoot = path.resolve(options.outRoot || 'adapter-result/repo-map-svgpanzoom-hot-reload');
  const result = await buildRepoMapSvgPanZoomArtifact({ ...options, outRoot });
  const htmlPath = path.join(outRoot, 'preview/index.html');
  injectHotReloadClient(htmlPath, '/__repo_map_events');
  const manifest = readJson(path.join(outRoot, 'proof/manifest.json'));
  const sourceProjectionDigest = manifest.inputContract?.sha256 || null;
  const generatedPreviewDigest = sha256File(htmlPath);
  const receipt = {
    kind: 'ui.repoMapHotReloadPreview.v1',
    status: 'PASS',
    issue: ['roccho-dev/ui#121', 'roccho-dev/ui#130'],
    outRoot,
    html: 'preview/index.html',
    inputPath: options.inputPath || null,
    sourceProjectionDigest,
    generatedPreviewDigest,
    generatedArtifactDigest: generatedPreviewDigest,
    digestAlgorithm: 'sha256',
    generatedArtifactsAreAuthority: false,
    localhostOnly: true,
    eventSource: '/__repo_map_events'
  };
  const proof = path.join(outRoot, 'proof/hot-reload-preview.json');
  fs.mkdirSync(path.dirname(proof), { recursive: true });
  fs.writeFileSync(proof, JSON.stringify(receipt, null, 2) + '\n');
  return { ...result, hotReload: receipt };
}

export async function serveRepoMapHotReloadPreview(options = {}) {
  const opts = { ...options, outRoot: path.resolve(options.outRoot || 'adapter-result/repo-map-svgpanzoom-hot-reload') };
  const clients = new Set();
  let last = await buildRepoMapHotReloadPreview(opts);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${opts.host || '127.0.0.1'}`);
    if (url.pathname === '/__repo_map_events') return sse(req, res, clients, last.hotReload);
    const file = url.pathname === '/' ? 'preview/index.html' : url.pathname.replace(/^\/+/, '');
    return serveFile(path.join(opts.outRoot, file), res);
  });
  const input = opts.inputPath ? path.resolve(opts.inputPath) : null;
  if (input) fs.watchFile(input, { interval: 300 }, async () => {
    try { last = await buildRepoMapHotReloadPreview(opts); broadcast(clients, 'repo-map-built', last.hotReload); }
    catch (error) { broadcast(clients, 'repo-map-error', { message: error.message }); }
  });
  await new Promise((resolve) => server.listen(opts.port || 4178, opts.host || '127.0.0.1', resolve));
  console.log(JSON.stringify({ status: 'repo-map-hot-reload-preview-serving', url: `http://${opts.host || '127.0.0.1'}:${opts.port || 4178}/preview/index.html`, inputPath: input, outRoot: opts.outRoot, generatedArtifactsAreAuthority: false }, null, 2));
  return { server, close: () => { if (input) fs.unwatchFile(input); server.close(); }, outRoot: opts.outRoot };
}

function injectHotReloadClient(htmlPath, url) {
  if (!fs.existsSync(htmlPath)) throw new Error(`repo map hot reload html missing: ${htmlPath}`);
  const client = `<script id="repo-map-hot-reload-client">
(() => {
  const source = new EventSource(${JSON.stringify(url)});
  source.addEventListener('repo-map-built', () => location.reload());
  source.addEventListener('repo-map-error', (event) => { document.body.dataset.repoMapError = event.data || 'repo-map-error'; });
})();
</script>`;
  let html = fs.readFileSync(htmlPath, 'utf8');
  if (!html.includes('repo-map-hot-reload-client')) html = html.replace('</body>', `${client}</body>`);
  fs.writeFileSync(htmlPath, html, 'utf8');
}
function sse(req, res, clients, receipt) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  clients.add(res);
  res.write(`event: repo-map-ready\ndata: ${JSON.stringify(receipt)}\n\n`);
  req.on('close', () => clients.delete(res));
}
function broadcast(clients, event, data) { for (const res of clients) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
function serveFile(file, res) { if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; } res.writeHead(200, { 'content-type': contentType(file) }); fs.createReadStream(file).pipe(res); }
function contentType(file) { if (file.endsWith('.html')) return 'text/html; charset=utf-8'; if (file.endsWith('.js')) return 'text/javascript; charset=utf-8'; if (file.endsWith('.json')) return 'application/json; charset=utf-8'; return 'text/plain; charset=utf-8'; }
function requireValue(argv, index, name) { if (index >= argv.length || argv[index].startsWith('--')) throw new Error(`${name} requires a value`); return argv[index]; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sha256File(file) { return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseRepoMapHotReloadArgs(process.argv.slice(2));
  if (opts.once) {
    const result = await buildRepoMapHotReloadPreview(opts);
    console.log(JSON.stringify({ status: 'repo-map-hot-reload-preview-check-pass', outRoot: result.outRoot, generatedArtifactsAreAuthority: false }, null, 2));
  } else {
    await serveRepoMapHotReloadPreview(opts);
  }
}
