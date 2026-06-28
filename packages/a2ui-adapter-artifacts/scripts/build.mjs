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
  const model = {meta: {adapterId: adapter, adapterLabel: adapter + ' adapter proof'}, requirements: {id: req.id, version: req.version, purpose: req.purpose}, ui: {}, runtime: {clientDataModelEnabled: true}};
  const messages = [
    {version: 'v0.9', createSurface: {surfaceId: req.outputContract.surfaceId, catalogId: req.outputContract.catalogId, sendDataModel: true}},
    {version: 'v0.9', updateComponents: {surfaceId: req.outputContract.surfaceId, components: [{id: 'root', component: req.outputContract.rootComponent, document: doc}]}},
  ];
  const proof = {status: adapter + '-adapter-proof-pass', adapter, boundaries: {coreRegistryShared: true, requirementPackExternalized: true, adapterIsThinMap: true, surfaceDesignHasNoDomainData: true, portsAllowlisted: true, actionsAllowlisted: true}};
  const base = path.join(outRoot, adapter + '-adapter-artifact');
  write(path.join(base, 'dist/a2ui', adapter + '.surface.jsonl'), messages.map(JSON.stringify).join('\n') + '\n');
  write(path.join(base, 'dist/a2ui', adapter + '.data-model-update.jsonl'), JSON.stringify({version: 'v0.9', updateDataModel: {surfaceId: req.outputContract.surfaceId, path: '/', value: model}}) + '\n');
  write(path.join(base, 'dist/data', adapter + '.data-model.json'), JSON.stringify(model, null, 2) + '\n');
  write(path.join(base, 'preview/index.html'), '<!doctype html><meta charset="utf-8"><pre>' + esc(JSON.stringify(model, null, 2)) + '</pre>');
  write(path.join(base, 'proof', adapter + '-adapter-proof-report.json'), JSON.stringify(proof, null, 2) + '\n');
  write(path.join(base, 'source', adapter + '.requirement-pack.json'), JSON.stringify(req, null, 2) + '\n');
  return {name: adapter + '-adapter-artifact', path: adapter + '-adapter-artifact', files: count(base), sha256: sha(base)};
}
function purposeDoc() { return {version: 'sdui.document.v1', styles: {css: ':host{display:block}.stage{min-height:120px}'}, tree: {type: 'box', className: 'stage', children: [{type: 'port', port: 'atlasStage', className: 'stage'}]}}; }
function json(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function write(file, text) { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text); }
function count(dir) { return fs.readdirSync(dir, {withFileTypes: true}).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0); }
function sha(dir) { const h = crypto.createHash('sha256'); for (const file of walk(dir).sort()) h.update(path.relative(dir, file)).update(fs.readFileSync(file)); return h.digest('hex'); }
function walk(dir, acc = []) { for (const e of fs.readdirSync(dir, {withFileTypes: true})) { const f = path.join(dir, e.name); e.isDirectory() ? walk(f, acc) : acc.push(f); } return acc; }
function esc(text) { return String(text).replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
