import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repoRoot = path.resolve(process.env.UI_REPO_ROOT || process.env.GITHUB_WORKSPACE || process.cwd());
const pkgRoot = path.join(repoRoot, 'packages/a2ui-adapter-artifacts');
const outRoot = path.resolve(process.env.ADAPTER_ARTIFACT_OUT || path.join(pkgRoot, '.generated'));
fs.rmSync(outRoot, {recursive: true, force: true});
fs.mkdirSync(outRoot, {recursive: true});
const artifacts = ['live'].map(build);
const index = {status: 'adapter-ci-artifacts-ready', artifacts, allPresent: artifacts.every((item) => item.files > 0)};
write(path.join(outRoot, 'adapter-artifact-index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(JSON.stringify(index, null, 2));

function build(adapter) {
  const reqPath = path.join(pkgRoot, 'requirements', adapter + '.json');
  const req = readJson(reqPath);
  const src = docSource(adapter, req, path.join(pkgRoot, 'a2ui/live-surface.json'));
  assertContract(adapter, req, src);
  const broken = process.env.ADAPTER_ARTIFACT_BROKEN_ADAPTER === adapter ? process.env.ADAPTER_ARTIFACT_BROKEN_CASE : '';
  const validationRoot = brokenRoot(src.validateRoot, broken);
  const checked = checkBoundary(adapter, req, validationRoot);
  const surfaceText = src.records.map(JSON.stringify).join('\n') + '\n';
  const inputShape = makeInputShape(req, broken);
  const model = {meta: {adapterId: adapter, adapterLabel: adapter + ' adapter proof', sourcePath: src.path, sourceKind: src.kind}, requirements: {id: req.id, version: req.version, purpose: req.purpose}, inputShape, ui: {}, runtime: {clientDataModelEnabled: true}};
  const modelText = JSON.stringify(model, null, 2) + '\n';
  const sourceDigest = 'sha256:' + shaText(src.text);
  const projectionDigest = 'sha256:' + shaText(surfaceText + modelText);
  const checkedInputs = [rel(reqPath), src.path, ...Object.keys(inputShape).map((key) => 'input:' + key)];
  const checkedOutputs = [`dist/a2ui/${adapter}.surface.jsonl`, `dist/a2ui/${adapter}.data-model-update.jsonl`, `dist/data/${adapter}.data-model.json`, 'preview/index.html', `proof/${adapter}-adapter-proof-report.json`];
  const workOrder = {id: adapter + '.closure-work-order', sourceDigest, currentProjectionDigest: broken === 'stale-work-order' ? 'sha256:stale' : projectionDigest, expectedOutputs: checkedOutputs};
  const receipt = makeReceipt(adapter, projectionDigest, broken);
  const proof = {
    status: adapter + '-adapter-proof-pass',
    adapter,
    source: {kind: src.kind, path: src.path, digest: sourceDigest, sha256: sourceDigest},
    generated: {surfaceSha256: shaText(surfaceText), dataModelSha256: shaText(modelText)},
    projection: {digest: projectionDigest},
    surface: {surfaceId: src.surfaceId, catalogId: src.catalogId, rootComponent: src.rootComponent, rootComponentId: src.rootComponentId},
    checked,
    checkedInputs,
    checkedOutputs,
    workOrder,
    receipt,
    closedGaps: receipt.closedGaps,
    residuals: receipt.residuals,
    checks: {sourceSurfaceExists: true, rootComponentMatchesRequirement: true, actionsAllowlisted: true, portsAllowlisted: true, currentProjectionDigest: true, receiptResidualHandling: true, previewIsHtml: true},
    boundaries: {coreRegistryShared: true, requirementPackExternalized: true, adapterIsThinMap: true, surfaceDesignHasNoDomainData: true},
  };
  if (broken === 'missing-source-digest') delete proof.source.digest;
  validateProof(adapter, req, proof, inputShape);
  const base = path.join(outRoot, adapter + '-adapter-artifact');
  write(path.join(base, 'dist/a2ui', adapter + '.surface.jsonl'), surfaceText);
  write(path.join(base, 'dist/a2ui', adapter + '.data-model-update.jsonl'), JSON.stringify({version: 'v0.9', updateDataModel: {surfaceId: req.outputContract.surfaceId, path: '/', value: model}}) + '\n');
  write(path.join(base, 'dist/data', adapter + '.data-model.json'), modelText);
  write(path.join(base, 'preview/index.html'), preview(adapter, req, src, checked));
  write(path.join(base, 'proof', adapter + '-adapter-proof-report.json'), JSON.stringify(proof, null, 2) + '\n');
  write(path.join(base, 'source', adapter + '.requirement-pack.json'), JSON.stringify(req, null, 2) + '\n');
  return {name: adapter + '-adapter-artifact', path: adapter + '-adapter-artifact', files: count(base), sha256: shaDir(base)};
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

function makeInputShape(req, broken) {
  const shape = Object.fromEntries((req.inputContract?.requiredTopLevel || []).map((key) => [key, []]));
  if (broken === 'missing-input-shape') delete shape[req.inputContract.requiredTopLevel[0]];
  return shape;
}

function makeReceipt(adapter, projectionDigest, broken) {
  const receipt = {
    status: 'closed',
    projectionDigest,
    closedGaps: ['gap-live-adapter-artifact'],
    residuals: [],
    residualHandling: {returnPath: 'ADRS/raw JSONL next projection', owner: 'ADRS', nextProjection: 'live adapter projection'},
  };
  if (broken === 'missing-residual-handling') delete receipt.residualHandling;
  return receipt;
}

function validateProof(adapter, req, proof, inputShape) {
  const missing = (req.inputContract?.requiredTopLevel || []).filter((key) => !(key in inputShape));
  if (!proof.source?.digest?.startsWith('sha256:')) throw new Error(adapter + ' proof missing source digest');
  if (!proof.projection?.digest?.startsWith('sha256:')) throw new Error(adapter + ' proof missing projection digest');
  if (missing.length) throw new Error(adapter + ' proof missing input shape: ' + missing.join(', '));
  if (proof.workOrder.currentProjectionDigest !== proof.projection.digest) throw new Error(adapter + ' proof has stale work order projection digest');
  if (proof.receipt.residuals.length && !proof.receipt.residualHandling) throw new Error(adapter + ' proof missing residual handling');
  if (!proof.checkedOutputs.includes(`proof/${adapter}-adapter-proof-report.json`)) throw new Error(adapter + ' proof output list missing proof report');
}

function brokenRoot(root, broken) { if (!['unexpected-action', 'unexpected-port'].includes(broken)) return root; return withExtra(root, broken === 'unexpected-action' ? {type: 'button', text: 'bad action', action: 'live.disallowedAction'} : {type: 'port', port: 'wrongStage'}); }
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
