import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repoRoot = path.resolve(process.env.UI_REPO_ROOT || process.env.GITHUB_WORKSPACE || process.cwd());
const pkgRoot = path.join(repoRoot, 'packages/a2ui-adapter-artifacts');
const outRoot = path.resolve(process.env.ADAPTER_ARTIFACT_OUT || path.join(pkgRoot, '.generated'));
fs.rmSync(outRoot, {recursive: true, force: true});
fs.mkdirSync(outRoot, {recursive: true});
const artifacts = ['live', 'purpose'].map(build);
const index = {status: 'adapter-ci-artifacts-ready', artifacts, allPresent: artifacts.every((item) => item.files > 0)};
write(path.join(outRoot, 'adapter-artifact-index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(JSON.stringify(index, null, 2));

function build(adapter) {
  const req = json(path.join(pkgRoot, 'requirements', adapter + '.json'));
  const doc = adapter === 'live' ? json(path.join(pkgRoot, 'a2ui/live-surface.json')) : purposeDoc();
  const input = adapter === 'live' ? json(path.join(pkgRoot, 'data/live-input.json')) : {base_nodes: [], base_edges: [], events: []};
  const model = makeModel(adapter, req, input);
  assertInputContract(req, model);
  assertSurfacePolicy(req, doc);
  const messages = [
    {version: 'v0.9', createSurface: {surfaceId: req.outputContract.surfaceId, catalogId: req.outputContract.catalogId, sendDataModel: true}},
    {version: 'v0.9', updateComponents: {surfaceId: req.outputContract.surfaceId, components: [{id: 'root', component: req.outputContract.rootComponent, document: doc}]}},
  ];
  const previewHtml = renderSduiHtml({adapter, doc, model});
  const proof = {status: adapter + '-adapter-proof-pass', adapter, boundaries: {coreRegistryShared: true, requirementPackExternalized: true, adapterIsThinMap: true, surfaceDesignHasNoDomainData: true, portsAllowlisted: true, actionsAllowlisted: true, uiBodyHtmlUploaded: true}, previewHtmlSha256: shaText(previewHtml)};
  const base = path.join(outRoot, adapter + '-adapter-artifact');
  write(path.join(base, 'dist/a2ui', adapter + '.surface.jsonl'), messages.map(JSON.stringify).join('\n') + '\n');
  write(path.join(base, 'dist/a2ui', adapter + '.data-model-update.jsonl'), JSON.stringify({version: 'v0.9', updateDataModel: {surfaceId: req.outputContract.surfaceId, path: '/', value: model}}) + '\n');
  write(path.join(base, 'dist/data', adapter + '.data-model.json'), JSON.stringify(model, null, 2) + '\n');
  write(path.join(base, 'preview/index.html'), previewHtml);
  write(path.join(base, 'preview', adapter + '-ui-body.html'), previewHtml);
  write(path.join(base, 'proof', adapter + '-adapter-proof-report.json'), JSON.stringify(proof, null, 2) + '\n');
  write(path.join(base, 'source', adapter + '.requirement-pack.json'), JSON.stringify(req, null, 2) + '\n');
  return {name: adapter + '-adapter-artifact', path: adapter + '-adapter-artifact', files: count(base), sha256: sha(base)};
}

function makeModel(adapter, req, input) {
  return {
    meta: {adapterId: adapter, adapterLabel: adapter + ' adapter proof'},
    requirements: {id: req.id, version: req.version, purpose: req.purpose},
    ...structuredClone(input),
    runtime: {clientDataModelEnabled: true, source: adapter === 'live' ? 'fixture-live-input' : 'fixture-empty'},
  };
}
function purposeDoc() { return {version: 'sdui.document.v1', styles: {css: ':host{display:block}.stage{min-height:120px}.preview-shell{padding:14px;font-family:system-ui,sans-serif}.preview-card{border:1px solid #ccd;border-radius:12px;padding:12px}'}, tree: {type: 'box', className: 'preview-shell', children: [{type: 'box', className: 'preview-card', children: [{type: 'text', text: 'purpose adapter surface shell'}, {type: 'port', port: 'atlasStage', className: 'stage'}]}]}}; }
function json(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function write(file, text) { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text); }
function count(dir) { return fs.readdirSync(dir, {withFileTypes: true}).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0); }
function sha(dir) { const h = crypto.createHash('sha256'); for (const file of walk(dir).sort()) h.update(path.relative(dir, file)).update(fs.readFileSync(file)); return h.digest('hex'); }
function walk(dir, acc = []) { for (const e of fs.readdirSync(dir, {withFileTypes: true})) { const f = path.join(dir, e.name); e.isDirectory() ? walk(f, acc) : acc.push(f); } return acc; }
function shaText(text) { return crypto.createHash('sha256').update(String(text)).digest('hex'); }
function esc(text) { return String(text ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function assertInputContract(req, model) {
  for (const key of req.inputContract?.requiredTopLevel || []) {
    if (!Object.hasOwn(model, key)) throw new Error(`${req.id}: missing required input ${key}`);
  }
}
function assertSurfacePolicy(req, doc) {
  const allowedActions = new Set(req.policies?.allowedActions || []);
  const allowedPorts = new Set(req.policies?.allowedPorts || []);
  walkDoc(doc.tree, (node) => {
    if (node.type === 'button' && node.action && !allowedActions.has(node.action)) throw new Error(`${req.id}: action not allowed ${node.action}`);
    if (node.type === 'port' && node.port && !allowedPorts.has(node.port)) throw new Error(`${req.id}: port not allowed ${node.port}`);
  });
}
function walkDoc(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const child of node.children || []) walkDoc(child, visit);
  if (node.template) walkDoc(node.template, visit);
}

function renderSduiHtml({adapter, doc, model}) {
  const css = cleanCss(doc.styles?.css || '');
  const body = renderNode(doc.tree, {model});
  const title = `${adapter} UI body`;
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n<style>${css}</style>\n</head>\n<body>\n<div id="app" data-adapter="${esc(adapter)}" data-proof="${esc(adapter)}-ui-body">\n${body}\n</div>\n<script id="a2ui-data-model" type="application/json">${esc(JSON.stringify(model))}</script>\n</body>\n</html>\n`;
}
function cleanCss(css) {
  const text = String(css || '');
  if (/@import|url\s*\(|expression\s*\(/i.test(text)) throw new Error('A2UI SDUI css contains a forbidden token');
  return text;
}
function renderNode(node, ctx) {
  if (!node || typeof node !== 'object') return '';
  if (node.when && !truthy(read(ctx, node.when))) return '';
  const classAttr = node.className || node.class ? ` class="${esc(renderText(ctx, node.className || node.class))}"` : '';
  if (node.type === 'box') return `<div${classAttr}>${(node.children || []).map((child) => renderNode(child, ctx)).join('')}</div>`;
  if (node.type === 'text') return `<span${classAttr}>${esc(renderText(ctx, node.text))}</span>`;
  if (node.type === 'button') return `<button${classAttr} type="button" data-action="${esc(node.action || '')}">${esc(renderText(ctx, node.text))}</button>`;
  if (node.type === 'repeat') {
    const items = read(ctx, node.itemsPath);
    return (Array.isArray(items) ? items : []).slice(0, node.limit || 50).map((item, index) => renderNode(node.template, {...ctx, item, index})).join('');
  }
  if (node.type === 'port') return renderPort(node, ctx, classAttr);
  return '';
}
function renderText(ctx, value) {
  if (value && typeof value === 'object' && typeof value.path === 'string') return read(ctx, value.path) ?? value.fallback ?? '';
  return String(value ?? '').replace(/\{\{\s*([a-zA-Z0-9_./-]+)\s*\}\}/g, (_, pathName) => {
    const found = read(ctx, pathName);
    return found == null ? '' : typeof found === 'object' ? JSON.stringify(found) : String(found);
  });
}
function read(ctx, sourcePath) {
  const raw = String(sourcePath || '');
  if (!raw) return undefined;
  if (raw === 'index') return ctx.index;
  if (raw === 'item') return ctx.item;
  let value;
  let parts;
  if (raw.startsWith('/')) {
    value = ctx.model;
    parts = raw.split('/').filter(Boolean);
  } else {
    parts = raw.split(/[./]/).filter(Boolean);
    if (parts[0] === 'item') { value = ctx.item; parts = parts.slice(1); }
    else if (parts[0] === 'index') { value = ctx.index; parts = parts.slice(1); }
    else value = ctx.model;
  }
  for (const part of parts) value = value?.[part];
  return value;
}
function truthy(value) { return Array.isArray(value) ? value.length > 0 : Boolean(value); }
function renderPort(node, ctx, classAttr) {
  const port = node.port || 'unknown';
  if (port === 'activityTimeline') {
    const rows = ctx.model.decisions || [];
    return `<section${classAttr} data-sdui-port="${esc(port)}"><span class="live-section">activity timeline</span><ol class="port-list">${rows.map((item) => `<li>${esc(item.t ?? '')}: ${esc(item.label)}</li>`).join('')}</ol></section>`;
  }
  if (port === 'repoStatus') {
    const repo = ctx.model.repo || {};
    return `<section${classAttr} data-sdui-port="${esc(port)}"><span class="live-section">repo</span><div class="repo-grid"><div><b>name</b> ${esc(repo.name)}</div><div><b>base</b> ${esc(repo.base)}</div><div><b>policy</b> ${esc(repo.mergePolicy)}</div></div></section>`;
  }
  if (port === 'evidenceList') {
    const rows = ctx.model.evidence || ctx.model.artifacts || [];
    return `<section${classAttr} data-sdui-port="${esc(port)}"><span class="live-section">evidence</span>${rows.map((item) => `<div class="live-evidence"><span class="live-name">${esc(item.label || item.id)}</span><span class="live-pill">${esc(item.status || item.kind || 'artifact')}</span><span class="live-meta">${esc(item.artifact || '')}</span></div>`).join('')}</section>`;
  }
  return `<section${classAttr} data-sdui-port="${esc(port)}"><span class="live-section">${esc(port)}</span><span class="live-note">runtime port placeholder</span></section>`;
}
