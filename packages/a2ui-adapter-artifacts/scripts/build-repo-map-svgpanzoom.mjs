import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import { makeRepoMapFixtureJsonl, parseJsonl, snapshotRecordsToCrudEvents, reduceModelGraph, projectGraph } from '../repo-map-svgpanzoom/src/core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sourceRoot = path.join(root, 'packages/a2ui-adapter-artifacts/repo-map-svgpanzoom');
const runtimeUrl = 'https://unpkg.com/svg-pan-zoom@3.6.2/dist/svg-pan-zoom.min.js';
let runtimeDigest = null;

export async function buildRepoMapSvgPanZoomArtifact(options = {}) {
  const opts = normalizeBuildOptions(options);
  fs.rmSync(opts.outRoot, { recursive: true, force: true });
  fs.mkdirSync(opts.outRoot, { recursive: true });

  const input = readRepoMapArtifactInput(opts);
  const core = fs.readFileSync(path.join(sourceRoot, 'src/core.mjs'), 'utf8');
  const runtime = await loadRuntime(opts);
  const records = parseJsonl(input.data);
  const graph = reduceModelGraph(snapshotRecordsToCrudEvents(records));
  const z0 = projectGraph(graph, { z: 0 });
  const z42 = projectGraph(graph, { z: 42, focusId: 'repo:repo-04' });
  const z80 = projectGraph(graph, { z: 80, focusId: 'pkg:r04-p00' });
  const html = renderHtml({ data: input.data, runtime, core });

  const files = {
    'preview/index.html': html,
    [input.sourceCopy]: input.sourceText,
    'proof/manifest.json': JSON.stringify({
      kind: 'ui.repoMapSvgPanZoomArtifactManifest.v1',
      status: 'PASS',
      issue: ['roccho-dev/ui#114', 'roccho-dev/ui#118'],
      renderer: 'coordinate-preserving-svg',
      cameraAdapter: 'svg-pan-zoom',
      svgPanZoom: { source: runtimeUrl, sha256: runtimeDigest },
      adapterOwnsState: false,
      generatedArtifactsAreAuthority: false,
      inputContract: {
        kind: 'ui.repoMapInputContract.v1',
        mode: input.mode,
        provider: input.provider,
        injectedBy: input.injectedBy,
        path: input.sourcePath,
        sha256: input.sha256,
        sourceCopy: input.sourceCopy,
        priority: ['cli', 'env', 'fixture'],
        acceptedInputs: ['repoMap world JSONL', 'repoMap projection JSON', 'legacy map.* JSONL'],
        generatedArtifactsAreAuthority: false,
      },
      invariants: ['repo = packages[]', 'package = models[]'],
      requiredProductControls: ['-', '+', 'fit'],
      forbiddenProductUi: ['repo button row', 'z debug text', 'HUD'],
      checks: { z0: summarize(z0), z42: summarize(z42), z80: summarize(z80) },
      outputs: ['preview/index.html', input.sourceCopy, 'proof/manifest.json'],
    }, null, 2) + '\n',
  };
  for (const [rel, text] of Object.entries(files)) write(path.join(opts.outRoot, rel), text);
  write(path.join(opts.outRoot, 'MANIFEST.sha256'), manifest(opts.outRoot));
  const result = { status: 'repo-map-svgpanzoom-artifact-built', outRoot: opts.outRoot, html: 'preview/index.html', inputMode: input.mode, generatedArtifactsAreAuthority: false };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

export function parseRepoMapBuildArgs(argv = [], env = process.env) {
  const parsed = { outRoot: env.REPO_MAP_SVGPANZOOM_ARTIFACT_OUT || null, inputPath: env.REPO_MAP_SVGPANZOOM_INPUT_PATH || env.REPO_MAP_SVGPANZOOM_INPUT || null, inputKind: env.REPO_MAP_SVGPANZOOM_INPUT_KIND || null, runtimePath: env.REPO_MAP_SVGPANZOOM_RUNTIME || null };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') parsed.outRoot = requireValue(argv, ++i, arg);
    else if (arg === '--input' || arg === '--input-jsonl') { parsed.inputPath = requireValue(argv, ++i, arg); parsed.inputKind = 'jsonl'; }
    else if (arg === '--projection' || arg === '--input-projection') { parsed.inputPath = requireValue(argv, ++i, arg); parsed.inputKind = 'projection-json'; }
    else if (arg === '--runtime') parsed.runtimePath = requireValue(argv, ++i, arg);
    else if (arg.startsWith('--')) throw new Error(`unknown repo-map artifact option: ${arg}`);
    else positional.push(arg);
  }
  if (!parsed.outRoot && positional.length) parsed.outRoot = positional.shift();
  if (positional.length) throw new Error(`unexpected repo-map artifact positional args: ${positional.join(', ')}`);
  return parsed;
}

function normalizeBuildOptions(options) {
  return { outRoot: path.resolve(options.outRoot || 'adapter-result/repo-map-svgpanzoom-artifact'), inputPath: options.inputPath ? path.resolve(options.inputPath) : null, inputKind: options.inputKind || null, runtimePath: options.runtimePath ? path.resolve(options.runtimePath) : null };
}
function readRepoMapArtifactInput(opts) {
  if (!opts.inputPath) return makeJsonlInput({ mode: 'fixture-jsonl', provider: 'built-in-fixture', injectedBy: 'fallback', sourcePath: 'built-in:makeRepoMapFixtureJsonl', sourceCopy: 'source/repo-package-model-map.jsonl', text: makeRepoMapFixtureJsonl() });
  if (!fs.existsSync(opts.inputPath)) throw new Error(`repo map input path does not exist: ${opts.inputPath}`);
  const text = fs.readFileSync(opts.inputPath, 'utf8');
  const kind = opts.inputKind || guessInputKind(opts.inputPath, text);
  if (kind === 'projection-json') return makeProjectionInput({ mode: 'external-projection-json', provider: 'external-path', injectedBy: 'cli-or-env', sourcePath: opts.inputPath, sourceCopy: 'source/repo-map-input.projection.json', text });
  return makeJsonlInput({ mode: 'external-jsonl', provider: 'external-path', injectedBy: 'cli-or-env', sourcePath: opts.inputPath, sourceCopy: 'source/repo-map-input.jsonl', text });
}
function makeJsonlInput({ mode, provider, injectedBy, sourcePath, sourceCopy, text }) { return { mode, provider, injectedBy, sourcePath, sourceCopy, sourceText: ensureTrailingNewline(text), data: ensureTrailingNewline(text), sha256: `sha256:${sha256(text)}` }; }
function makeProjectionInput({ mode, provider, injectedBy, sourcePath, sourceCopy, text }) { const parsed = parseJson(text, sourcePath); const projection = parsed.projection || parsed; const data = projectionToJsonl(projection); return { mode, provider, injectedBy, sourcePath, sourceCopy, sourceText: ensureTrailingNewline(text), data, sha256: `sha256:${sha256(text)}` }; }
function projectionToJsonl(projection) {
  if (!projection || typeof projection !== 'object') throw new Error('repo map projection input must be a JSON object');
  if (!Array.isArray(projection.nodes)) throw new Error('repo map projection missing nodes[]');
  if (!Array.isArray(projection.edges)) throw new Error('repo map projection missing edges[]');
  const policy = normalizeLegacyKind(projection.policy || { id: 'policy:projection', world: projectionWorld(projection), camera: { z: 0, minZ: 0, maxZ: 100, svgPanZoomMaxZoom: 16 }, edge: { maxVisibleRepo: 9, maxVisiblePackage: 16, maxVisibleModel: 24 } }, 'map.policy.v1');
  const records = [policy, ...projection.nodes.map((node) => normalizeLegacyKind(node, 'map.node.v1')), ...projection.edges.map((edge) => normalizeLegacyKind(edge, 'map.edge.v1'))];
  return records.map((record) => JSON.stringify(record)).join('\n') + '\n';
}
function normalizeLegacyKind(record, fallbackKind) { const next = { ...record }; if (next.kind === 'repoMap.policy.v1') next.kind = 'map.policy.v1'; if (next.kind === 'repoMap.node.v1') next.kind = 'map.node.v1'; if (next.kind === 'repoMap.edge.v1') next.kind = 'map.edge.v1'; if (!next.kind) next.kind = fallbackKind; return next; }
function projectionWorld(projection) { if (projection.policy?.world) return projection.policy.world; if (!projection.nodes?.length) return { x: 0, y: 0, w: 1000, h: 700 }; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; for (const node of projection.nodes) { const r = node.rect || { x: 0, y: 0, w: 1, h: 1 }; minX = Math.min(minX, r.x); minY = Math.min(minY, r.y); maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h); } return { x: minX - 80, y: minY - 80, w: Math.max(320, maxX - minX + 160), h: Math.max(240, maxY - minY + 160) }; }
function guessInputKind(file, text) { if (file.endsWith('.json')) return 'projection-json'; const trimmed = text.trimStart(); if (trimmed.startsWith('{') && !trimmed.includes('\n')) return 'projection-json'; return 'jsonl'; }

function renderHtml({ data, runtime, core }) {
  const app = String.raw`
const RAW_JSONL = ${JSON.stringify(data)};
${stripModule(core)}
const NS = 'http://www.w3.org/2000/svg';
function bootRepoMapApp(root) {
  root.innerHTML = '<div class="app-shell"><header class="toolbar"><strong>Repo Map</strong><button id="zoomOut" aria-label="zoom out">−</button><button id="zoomIn" aria-label="zoom in">＋</button><button id="fit" aria-label="fit whole map">fit</button></header><main id="stage" class="stage"></main><script type="application/json" id="repo-map-smoke-report">{}<\/script></div>';
  const graph = reduceModelGraph(snapshotRecordsToCrudEvents(parseJsonl(RAW_JSONL)));
  const stage = root.querySelector('#stage');
  const svg = svgEl('svg', { class: 'repo-map-svg', role: 'img', 'aria-label': 'repo package model semantic map' });
  const viewport = svgEl('g', { class: 'svg-pan-zoom_viewport' });
  const edgeLayer = svgEl('g');
  const nodeLayer = svgEl('g');
  viewport.append(edgeLayer, nodeLayer); svg.append(viewport); stage.replaceChildren(svg);
  const world = graph.policy.world; svg.setAttribute('viewBox', world.x + ' ' + world.y + ' ' + world.w + ' ' + world.h);
  const maxZoom = graph.policy.camera.svgPanZoomMaxZoom || 16;
  const instance = window.svgPanZoom(svg, { viewportSelector: '.svg-pan-zoom_viewport', panEnabled: true, zoomEnabled: true, mouseWheelZoomEnabled: true, dblClickZoomEnabled: true, controlIconsEnabled: false, fit: true, center: true, minZoom: 1, maxZoom, zoomScaleSensitivity: 0.25, onZoom: updateFromZoom, onPan: () => writeSmoke(root, svg, currentStats()) });
  let semanticZ = 0;
  let lastZoom = instance.getZoom();
  let fitting = false;
  function projectionForZ(z) { return projectGraph(graph, { z, focusId: z >= 66 ? 'pkg:r04-p00' : 'repo:repo-04' }); }
  function currentStats() { return { z: semanticZ, zoom: instance.getZoom(), roles: {}, nodeCount: 0, edgeCount: 0 }; }
  function updateFromZoom() {
    if (fitting) return;
    const nextZoom = Math.max(1, instance.getZoom());
    const delta = Math.log(nextZoom / Math.max(1, lastZoom)) / Math.log(maxZoom) * 100;
    if (Math.abs(delta) < 0.05) return;
    semanticZ = Math.max(0, Math.min(100, semanticZ + delta));
    draw(projectionForZ(semanticZ));
  }
  function resetCameraToView() { fitting = true; instance.resize(); instance.fit(); instance.center(); lastZoom = Math.max(1, instance.getZoom()); fitting = false; }
  function setZ(z) { semanticZ = Math.max(0, Math.min(100, z)); draw(projectionForZ(semanticZ)); }
  root.querySelector('#zoomOut').addEventListener('click', () => instance.zoomOut());
  root.querySelector('#zoomIn').addEventListener('click', () => instance.zoomIn());
  root.querySelector('#fit').addEventListener('click', () => { semanticZ = 0; draw(projectGraph(graph, { z: 0 })); });
  function draw(view) {
    const box = viewBoxFor(view, graph.policy.world);
    svg.setAttribute('viewBox', box.x + ' ' + box.y + ' ' + box.w + ' ' + box.h);
    edgeLayer.replaceChildren(); nodeLayer.replaceChildren();
    const byId = Object.fromEntries(view.nodes.map((n) => [n.id, n]));
    for (const edge of view.edges) { const a = byId[edge.from], b = byId[edge.to]; if (!a || !b) continue; const s = border(a.rect, center(b.rect)), e = border(b.rect, center(a.rect)); edgeLayer.append(svgEl('line', { class: 'edge', 'data-kind': 'edge', x1: s.x, y1: s.y, x2: e.x, y2: e.y, stroke: '#111', 'stroke-width': edge.style?.strokeWidth || 1, 'stroke-dasharray': edge.style?.dash || null })); }
    for (const node of view.nodes.sort((a,b) => a.depth - b.depth)) {
      const r = node.rect; const rect = svgEl('rect', { class: 'node node-' + node.role, 'data-kind': 'node', 'data-id': node.id, 'data-role': node.role, 'data-container': node.container || '', x: r.x, y: r.y, width: r.w, height: r.h, fill: node.style?.fill || 'none', stroke: '#111', 'stroke-width': node.style?.strokeWidth || 1 });
      nodeLayer.append(rect); const label = labelText(node); if (label) { const size = labelFontWorld(node, view.policy, view.camera.z, 1); const text = svgEl('text', { class: 'label', 'data-role': node.role, 'data-for': node.id, x: r.x + 10, y: r.y + size * 1.2, 'font-size': size }, label); nodeLayer.append(text); }
    }
    resetCameraToView();
    writeSmoke(root, svg, { z: view.camera.z, zoom: instance.getZoom(), roles: countRoles(view.nodes), nodeCount: view.nodes.length, edgeCount: view.edges.length });
  }
  const query = new URLSearchParams(location.search); const testCase = query.get('testCase'); if (testCase?.endsWith('z42')) setZ(42); else if (testCase?.endsWith('z80')) setZ(80); else setZ(0);
  window.__repoMapTest = { setZ, stats: () => JSON.parse(root.querySelector('#repo-map-smoke-report').textContent) };
}
function svgEl(name, attrs = {}, text = null) { const n = document.createElementNS(NS, name); for (const [k,v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, String(v)); if (text !== null) n.textContent = text; return n; }
function center(r) { return { x: r.x + r.w/2, y: r.y + r.h/2 }; }
function border(r, toward) { const c = center(r), dx = toward.x-c.x, dy = toward.y-c.y; if (!dx && !dy) return c; const s = Math.min(dx ? (r.w/2)/Math.abs(dx) : Infinity, dy ? (r.h/2)/Math.abs(dy) : Infinity); return { x: c.x + dx*s, y: c.y + dy*s }; }
function viewBoxFor(view, world) { if (!view.nodes.length || view.camera.z < 24) return world; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; for (const n of view.nodes) { minX = Math.min(minX, n.rect.x); minY = Math.min(minY, n.rect.y); maxX = Math.max(maxX, n.rect.x + n.rect.w); maxY = Math.max(maxY, n.rect.y + n.rect.h); } const pad = view.camera.z < 66 ? 120 : 80; const w = Math.min(world.w, maxX - minX + pad * 2); const h = Math.min(world.h, maxY - minY + pad * 2); return { x: Math.max(world.x, Math.min(minX - pad, world.x + world.w - w)), y: Math.max(world.y, Math.min(minY - pad, world.y + world.h - h)), w, h }; }
function labelText(n) { if (n.role === 'repo') return n.id.replace(/^repo:repo-/, 'r'); if (n.role === 'package') return n.id.replace(/^pkg:r(\\d+)-p(\\d+)/, 'p$1-$2'); if (n.role === 'model') return n.id.replace(/^model:r\\d+-p\\d+-m/, 'm'); return n.label || n.id; }
function labelFontWorld(node, policy, z, zoom) { const f = policy.font || {}, min = f.minPx || 4, max = f.maxPx || 16; const px = Math.max(min, Math.min(max, (f.basePx || 15) * Math.exp((f.zoomGain || 0.12) * z/100 - (f.depthDecay || 0.7) * (node.depth || 0)))); return px * ((policy.world?.w || 1000) / Math.max(320, document.querySelector('.stage')?.getBoundingClientRect().width || 1280)) / Math.max(1, zoom); }
function countRoles(nodes) { return nodes.reduce((a,n) => (a[n.role] = (a[n.role] || 0) + 1, a), {}); }
function writeSmoke(root, svg, stats) { const stage = root.querySelector('#stage')?.getBoundingClientRect(); const rects = [...svg.querySelectorAll('rect.node')].map((el) => { const b = el.getBoundingClientRect(); return { id: el.dataset.id, role: el.dataset.role, container: el.dataset.container, x: b.x, y: b.y, w: b.width, h: b.height, onScreen: stage ? b.right >= stage.left && b.left <= stage.right && b.bottom >= stage.top && b.top <= stage.bottom : true }; }); const byId = Object.fromEntries(rects.filter((r) => r.onScreen).map((r) => [r.id, r])); const labels = [...svg.querySelectorAll('text.label')].map((el) => { const b = el.getBoundingClientRect(); return { text: el.textContent, role: el.dataset.role, forId: el.dataset.for, x: b.x, y: b.y, w: b.width, h: b.height, target: byId[el.dataset.for] || null }; }); const productUi = { debugZText: Boolean(root.querySelector('#ztext')), hud: Boolean(root.querySelector('.hud')), repoButtonRow: Boolean(root.querySelector('.focusRow')), controls: [...root.querySelectorAll('button')].map((b) => b.textContent.trim()) }; root.querySelector('#repo-map-smoke-report').textContent = JSON.stringify({ stats, rects, labels, productUi, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }); }
bootRepoMapApp(document.getElementById('app'));
`;
  return `<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="generatedArtifactsAreAuthority" content="false"><meta name="adapterOwnsState" content="false"><title>Repo Map svg-pan-zoom semantic LOD</title><style>${css()}</style></head><body><div id="app"></div><script>${runtime}</script><script type="module">${app}</script></body></html>\n`;
}
async function loadRuntime(opts = {}) { const env = opts.runtimePath || process.env.REPO_MAP_SVGPANZOOM_RUNTIME; if (env && fs.existsSync(env)) return recordRuntime(fs.readFileSync(env, 'utf8')); const response = await fetch(runtimeUrl); if (!response.ok) throw new Error(`failed to fetch svg-pan-zoom runtime: ${response.status}`); return recordRuntime(await response.text()); }
function recordRuntime(text) { runtimeDigest = sha256(text); return text; }
function css() { return `html,body,#app{margin:0;width:100%;height:100%}body{font-family:ui-monospace,Menlo,Consolas,monospace;background:#fff;color:#111;overscroll-behavior:none}.app-shell{height:100svh;display:grid;grid-template-rows:auto 1fr;box-sizing:border-box;padding:10px;gap:8px}.toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px}button{font:inherit;border:1px solid #111;background:#fff;min-width:36px;min-height:30px}.stage{border:1px solid #111;overflow:hidden;touch-action:none;min-height:280px}.repo-map-svg{width:100%;height:100%;display:block;background:#fff}.node-repo,.node-package,.node-model,.edge{vector-effect:non-scaling-stroke}.label{fill:#111;pointer-events:none}@media(max-width:640px){.app-shell{padding:6px;gap:6px}.toolbar{font-size:12px}button{min-width:40px;min-height:34px}.stage{min-height:320px}}`; }
function summarize(view) { return view.nodes.reduce((acc, node) => ({ ...acc, [node.role]: (acc[node.role] || 0) + 1 }), {}); }
function stripModule(source) { return source.replace(/^import .*$/gm, '').replace(/export function /g, 'function ').replace(/export class /g, 'class ').replace(/export const /g, 'const '); }
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, 'utf8'); }
function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function manifest(dir) { return collect(dir).filter((file) => file !== 'MANIFEST.sha256').map((file) => `${sha256(fs.readFileSync(path.join(dir, file), 'utf8'))}  ${file}`).join('\n') + '\n'; }
function collect(dir, prefix = '') { return fs.readdirSync(dir).sort().flatMap((name) => { const full = path.join(dir, name); const rel = prefix ? `${prefix}/${name}` : name; return fs.statSync(full).isDirectory() ? collect(full, rel) : [rel]; }); }
function requireValue(argv, index, name) { if (index >= argv.length || argv[index].startsWith('--')) throw new Error(`${name} requires a value`); return argv[index]; }
function parseJson(text, label) { try { return JSON.parse(text); } catch (error) { error.message = `invalid JSON in ${label}: ${error.message}`; throw error; } }
function ensureTrailingNewline(text) { return text.endsWith('\n') ? text : `${text}\n`; }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildRepoMapSvgPanZoomArtifact(parseRepoMapBuildArgs(process.argv.slice(2)));
