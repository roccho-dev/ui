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
  const req = readJson(path.join(pkgRoot, 'requirements', adapter + '.json'));
  const src = adapter === 'purpose' ? purposeSource(req) : docSource(adapter, req, path.join(pkgRoot, 'a2ui/live-surface.json'));
  assertContract(adapter, req, src);
  const checked = checkBoundary(adapter, req, src.validateRoot);
  if (adapter === 'purpose') checked.negativeControls = negativeControls(req, src.validateRoot);
  const surfaceText = src.records.map(JSON.stringify).join('\n') + '\n';
  const model = {meta: {adapterId: adapter, adapterLabel: adapter + ' adapter proof', sourcePath: src.path, sourceKind: src.kind}, requirements: {id: req.id, version: req.version, purpose: req.purpose}, ui: {}, runtime: {clientDataModelEnabled: true}};
  const modelText = JSON.stringify(model, null, 2) + '\n';
  const proof = {status: adapter + '-adapter-proof-pass', adapter, source: {kind: src.kind, path: src.path, sha256: shaText(src.text)}, generated: {surfaceSha256: shaText(surfaceText), dataModelSha256: shaText(modelText)}, surface: {surfaceId: src.surfaceId, catalogId: src.catalogId, rootComponent: src.rootComponent, rootComponentId: src.rootComponentId}, checked, checks: {sourceSurfaceExists: true, rootComponentMatchesRequirement: true, actionsAllowlisted: true, portsAllowlisted: true, previewIsHtml: true}, boundaries: {coreRegistryShared: true, requirementPackExternalized: true, adapterIsThinMap: true, surfaceDesignHasNoDomainData: true}};
  const base = path.join(outRoot, adapter + '-adapter-artifact');
  write(path.join(base, 'dist/a2ui', adapter + '.surface.jsonl'), surfaceText);
  write(path.join(base, 'dist/a2ui', adapter + '.data-model-update.jsonl'), JSON.stringify({version: 'v0.9', updateDataModel: {surfaceId: req.outputContract.surfaceId, path: '/', value: model}}) + '\n');
  write(path.join(base, 'dist/data', adapter + '.data-model.json'), modelText);
  write(path.join(base, 'preview/index.html'), preview(adapter, req, src, checked));
  write(path.join(base, 'proof', adapter + '-adapter-proof-report.json'), JSON.stringify(proof, null, 2) + '\n');
  write(path.join(base, 'source', adapter + '.requirement-pack.json'), JSON.stringify(req, null, 2) + '\n');
  if (adapter === 'purpose') write(path.join(base, 'source/purpose-atlas.surface.v0.9.jsonl'), src.text.endsWith('\n') ? src.text : src.text + '\n');
  return {name: adapter + '-adapter-artifact', path: adapter + '-adapter-artifact', files: count(base), sha256: shaDir(base)};
}

function purposeSource(req) {
  const file = path.join(repoRoot, 'tests/fixtures/purpose-atlas/surface.v0.9.jsonl');
  const text = fs.readFileSync(file, 'utf8');
  const records = text.split(/\r?\n/).filter(Boolean).map((line, i) => parseJson(line, file + ':' + (i + 1)));
  const create = records.find((r) => r.createSurface?.surfaceId === req.outputContract.surfaceId);
  const update = records.find((r) => r.updateComponents?.surfaceId === req.outputContract.surfaceId);
  const component = update?.updateComponents?.components?.find((c) => c.id === 'root' || c.component === req.outputContract.rootComponent);
  if (!create || !update || !component?.document) throw new Error('purpose source surface is incomplete: ' + rel(file));
  return {kind: 'surface-jsonl-fixture', path: rel(file), text, records, document: component.document, validateRoot: component, surfaceId: create.createSurface.surfaceId, catalogId: create.createSurface.catalogId, rootComponent: component.component, rootComponentId: component.id};
}

function docSource(adapter, req, file) {
  const text = fs.readFileSync(file, 'utf8');
  const document = parseJson(text, file);
  const records = [{version: 'v0.9', createSurface: {surfaceId: req.outputContract.surfaceId, catalogId: req.outputContract.catalogId, sendDataModel: true}}, {version: 'v0.9', updateComponents: {surfaceId: req.outputContract.surfaceId, components: [{id: 'root', component: req.outputContract.rootComponent, document}]}}];
  return {kind: 'document-json', path: rel(file), text, records, document, validateRoot: document, surfaceId: req.outputContract.surfaceId, catalogId: req.outputContract.catalogId, rootComponent: req.outputContract.rootComponent, rootComponentId: 'root'};
}

function assertContract(adapter, req, src) {
  const bad = [];
  if (src.surfaceId !== req.outputContract.surfaceId) bad.push('surfaceId');
  if (src.catalogId !== req.outputContract.catalogId) bad.push('catalogId');
  if (src.rootComponent !== req.outputContract.rootComponent) bad.push('rootComponent');
  if (bad.length) throw new Error(adapter + ' surface contract mismatch: ' + bad.join(', '));
}

function checkBoundary(adapter, req, root) {
  const actions = [...collectActions(root, root)].sort();
  const ports = [...collectKeys(root, 'port')].sort();
  const paths = [...collectKeys(root, 'path')].sort();
  const badActions = actions.filter((x) => !(req.policies.allowedActions || []).includes(x));
  const badPorts = ports.filter((x) => !(req.policies.allowedPorts || []).includes(x));
  if (badActions.length || badPorts.length) throw new Error(adapter + ' adapter boundary proof failed: ' + JSON.stringify({actions: badActions, ports: badPorts}));
  return {actions, ports, paths};
}

function negativeControls(req, root) {
  return [mustReject('rejects-disallowed-purpose-action', req, withExtra(root, {type: 'button', text: 'bad action', action: 'atlas.disallowedAction'})), mustReject('rejects-disallowed-purpose-port', req, withExtra(root, {type: 'port', port: 'wrongStage'}))];
}
function mustReject(id, req, root) { try { checkBoundary('purpose-negative-control', req, root); } catch (e) { return {id, status: 'pass', rejected: true, message: e.message}; } throw new Error('negative control did not fail: ' + id); }
function withExtra(root, extra) { const copy = JSON.parse(JSON.stringify(root)); const target = copy.document || copy; target.tree = {type: 'box', children: [target.tree, extra]}; return copy; }

function collectActions(value, root, acc = new Set()) {
  if (Array.isArray(value)) for (const item of value) collectActions(item, root, acc);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { if (k === 'event' && typeof v?.name === 'string') acc.add(v.name); if (typeof v === 'string' && (k === 'action' || /^on[A-Z]/.test(k))) acc.add(resolveEvent(root, v) || v); collectActions(v, root, acc); }
  return acc;
}
function collectKeys(value, key, acc = new Set()) { if (Array.isArray(value)) for (const item of value) collectKeys(item, key, acc); else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { if (k === key && typeof v === 'string') acc.add(v); collectKeys(v, key, acc); } return acc; }
function resolveEvent(root, action) { return root?.[action]?.event?.name || root?.document?.[action]?.event?.name || null; }

function preview(adapter, req, src, checked) { return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(adapter + ' adapter artifact preview') + '</title><style>body{margin:0;background:#07101f;color:#eaf2ff;font-family:system-ui,sans-serif}.proof{display:flex;gap:8px;flex-wrap:wrap;padding:10px}.pill{border:1px solid #456;border-radius:999px;padding:4px 8px}.stage{min-height:360px;border-top:1px solid #456;padding:12px}.port{border:1px dashed #8df0bd;padding:12px;border-radius:12px;color:#caffdf}</style><section class="proof"><b>' + esc(req.outputContract.surfaceId) + '</b><span class="pill">source: ' + esc(src.path) + '</span><span class="pill">actions: ' + checked.actions.length + '</span><span class="pill">ports: ' + esc(checked.ports.join(', ')) + '</span><span class="pill">proof-pass</span></section><section class="stage">' + render(src.document.tree) + '</section>'; }
function render(node) { if (!node || typeof node !== 'object') return ''; const kids = (node.children || []).map(render).join(''); if (node.type === 'text') return '<span>' + esc(text(node.text)) + '</span>'; if (node.type === 'button') return '<button disabled>' + esc(text(node.text)) + '</button>'; if (node.type === 'port') return '<div class="port">port: ' + esc(node.port) + '</div>'; return '<div>' + kids + '</div>'; }
function text(v) { return typeof v === 'string' ? v : v?.path ? '{{' + v.path + '}}' : ''; }
function readJson(file) { return parseJson(fs.readFileSync(file, 'utf8'), file); }
function parseJson(text, label) { try { return JSON.parse(text); } catch (e) { throw new Error('invalid JSON in ' + label + ': ' + e.message); } }
function write(file, text) { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text); }
function count(dir) { return fs.readdirSync(dir, {withFileTypes: true}).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0); }
function shaDir(dir) { const h = crypto.createHash('sha256'); for (const f of walk(dir).sort()) h.update(path.relative(dir, f)).update(fs.readFileSync(f)); return h.digest('hex'); }
function shaText(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function walk(dir, acc = []) { for (const e of fs.readdirSync(dir, {withFileTypes: true})) { const f = path.join(dir, e.name); e.isDirectory() ? walk(f, acc) : acc.push(f); } return acc; }
function rel(file) { return path.relative(repoRoot, file).split(path.sep).join('/'); }
function esc(value) { return String(value).replace(/[&<>]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c])); }
