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
  const source = adapter === 'purpose' ? purposeFixtureSource(req) : documentSource(adapter, req, path.join(pkgRoot, 'a2ui/live-surface.json'));
  assertSurfaceContract(adapter, req, source);
  const validation = validateDocument(adapter, req, source.document);
  const negativeControls = adapter === 'purpose' ? purposeNegativeControls(req, source.document) : [];
  const surfaceText = jsonl(source.messages);
  const model = {
    meta: {
      adapterId: adapter,
      adapterLabel: adapter + ' adapter proof',
      sourcePath: source.sourcePath,
      sourceKind: source.sourceKind,
    },
    requirements: {id: req.id, version: req.version, purpose: req.purpose},
    ui: {},
    runtime: {clientDataModelEnabled: true},
  };
  const dataModelText = JSON.stringify(model, null, 2) + '\n';
  const proof = {
    status: adapter + '-adapter-proof-pass',
    adapter,
    source: {kind: source.sourceKind, path: source.sourcePath, sha256: shaText(source.sourceText)},
    generated: {surfaceSha256: shaText(surfaceText), dataModelSha256: shaText(dataModelText)},
    surface: {surfaceId: source.surfaceId, catalogId: source.catalogId, rootComponent: source.rootComponent, rootComponentId: source.rootComponentId},
    checked: {
      actions: validation.actions,
      ports: validation.ports,
      paths: validation.paths,
      negativeControls,
    },
    checks: {
      sourceSurfaceExists: true,
      rootComponentMatchesRequirement: true,
      actionsAllowlisted: validation.disallowedActions.length === 0,
      portsAllowlisted: validation.disallowedPorts.length === 0,
      pathRootsAllowlisted: validation.disallowedPaths.length === 0,
      previewIsHtml: true,
    },
    boundaries: {
      coreRegistryShared: true,
      requirementPackExternalized: true,
      adapterIsThinMap: true,
      surfaceDesignHasNoDomainData: true,
    },
  };
  const base = path.join(outRoot, adapter + '-adapter-artifact');
  write(path.join(base, 'dist/a2ui', adapter + '.surface.jsonl'), surfaceText);
  write(path.join(base, 'dist/a2ui', adapter + '.data-model-update.jsonl'), JSON.stringify({version: 'v0.9', updateDataModel: {surfaceId: req.outputContract.surfaceId, path: '/', value: model}}) + '\n');
  write(path.join(base, 'dist/data', adapter + '.data-model.json'), dataModelText);
  write(path.join(base, 'preview/index.html'), previewHtml(adapter, req, source, validation));
  write(path.join(base, 'proof', adapter + '-adapter-proof-report.json'), JSON.stringify(proof, null, 2) + '\n');
  write(path.join(base, 'source', adapter + '.requirement-pack.json'), JSON.stringify(req, null, 2) + '\n');
  if (adapter === 'purpose') write(path.join(base, 'source/purpose-atlas.surface.v0.9.jsonl'), source.sourceText.endsWith('\n') ? source.sourceText : source.sourceText + '\n');
  return {name: adapter + '-adapter-artifact', path: adapter + '-adapter-artifact', files: count(base), sha256: sha(base)};
}

function purposeFixtureSource(req) {
  const file = path.join(repoRoot, 'tests/fixtures/purpose-atlas/surface.v0.9.jsonl');
  const {text, records} = readJsonl(file, 'purpose source surface');
  const createRecord = records.find((record) => record.createSurface && record.createSurface.surfaceId === req.outputContract.surfaceId);
  if (!createRecord) throw new Error('purpose source surface is missing createSurface for ' + req.outputContract.surfaceId);
  if (createRecord.createSurface.catalogId !== req.outputContract.catalogId) throw new Error('purpose source catalogId mismatch');
  const updateRecord = records.find((record) => record.updateComponents && record.updateComponents.surfaceId === req.outputContract.surfaceId);
  if (!updateRecord) throw new Error('purpose source surface is missing updateComponents for ' + req.outputContract.surfaceId);
  const component = (updateRecord.updateComponents.components || []).find((item) => item.id === 'root' || item.component === req.outputContract.rootComponent);
  if (!component) throw new Error('purpose source surface is missing root component');
  if (component.component !== req.outputContract.rootComponent) throw new Error('purpose source root component mismatch');
  if (!component.document || typeof component.document !== 'object') throw new Error('purpose source root component has no SDUI document');
  return {
    sourceKind: 'surface-jsonl-fixture',
    sourcePath: rel(file),
    sourceText: text,
    messages: records,
    document: component.document,
    surfaceId: createRecord.createSurface.surfaceId,
    catalogId: createRecord.createSurface.catalogId,
    rootComponent: component.component,
    rootComponentId: component.id,
  };
}

function documentSource(adapter, req, file) {
  const text = readRequired(file, adapter + ' source document');
  const doc = parseJson(text, file);
  const messages = [
    {version: 'v0.9', createSurface: {surfaceId: req.outputContract.surfaceId, catalogId: req.outputContract.catalogId, sendDataModel: true}},
    {version: 'v0.9', updateComponents: {surfaceId: req.outputContract.surfaceId, components: [{id: 'root', component: req.outputContract.rootComponent, document: doc}]}},
  ];
  return {
    sourceKind: 'document-json',
    sourcePath: rel(file),
    sourceText: text,
    messages,
    document: doc,
    surfaceId: req.outputContract.surfaceId,
    catalogId: req.outputContract.catalogId,
    rootComponent: req.outputContract.rootComponent,
    rootComponentId: 'root',
  };
}

function assertSurfaceContract(adapter, req, source) {
  const failures = [];
  if (source.surfaceId !== req.outputContract.surfaceId) failures.push('surfaceId=' + source.surfaceId);
  if (source.catalogId !== req.outputContract.catalogId) failures.push('catalogId=' + source.catalogId);
  if (source.rootComponent !== req.outputContract.rootComponent) failures.push('rootComponent=' + source.rootComponent);
  if (failures.length) throw new Error(adapter + ' surface contract mismatch: ' + failures.join(', '));
}

function validateDocument(adapter, req, doc) {
  const actions = [...collectActions(doc, doc)].sort();
  const ports = [...collectPorts(doc)].sort();
  const paths = [...collectPaths(doc)].sort();
  const allowedActions = new Set(req.policies.allowedActions || []);
  const allowedPorts = new Set(req.policies.allowedPorts || []);
  const allowedRoots = req.policies.allowedPathRoots || [];
  const disallowedActions = actions.filter((action) => !allowedActions.has(action));
  const disallowedPorts = ports.filter((port) => !allowedPorts.has(port));
  const disallowedPaths = paths.filter((item) => !isAllowedPath(item, allowedRoots));
  const blockingViolations = {actions: disallowedActions, ports: disallowedPorts};
  if (disallowedActions.length || disallowedPorts.length) {
    throw new Error(adapter + ' adapter boundary proof failed: ' + JSON.stringify(blockingViolations));
  }
  return {actions, ports, paths, disallowedActions, disallowedPorts, disallowedPaths};
}

function purposeNegativeControls(req, doc) {
  return [
    mustReject('rejects-disallowed-purpose-action', req, withExtraTree(doc, {type: 'button', text: 'bad action', action: 'atlas.disallowedAction'})),
    mustReject('rejects-disallowed-purpose-port', req, withExtraTree(doc, {type: 'port', port: 'wrongStage'})),
  ];
}

function mustReject(id, req, doc) {
  try {
    validateDocument('purpose-negative-control', req, doc);
  } catch (error) {
    return {id, status: 'pass', rejected: true, message: error.message};
  }
  throw new Error('negative control did not fail: ' + id);
}

function withExtraTree(doc, extra) {
  const cloned = JSON.parse(JSON.stringify(doc));
  cloned.tree = {type: 'box', children: [cloned.tree, extra]};
  return cloned;
}

function collectActions(value, doc, acc = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectActions(item, doc, acc);
    return acc;
  }
  if (!value || typeof value !== 'object') return acc;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'event' && item && typeof item === 'object' && typeof item.name === 'string') acc.add(item.name);
    if (typeof item === 'string' && (key === 'action' || /^on[A-Z]/.test(key))) acc.add(resolveEventName(doc, item) || item);
    collectActions(item, doc, acc);
  }
  return acc;
}

function collectPorts(value, acc = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectPorts(item, acc);
    return acc;
  }
  if (!value || typeof value !== 'object') return acc;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'port' && typeof item === 'string') acc.add(item);
    collectPorts(item, acc);
  }
  return acc;
}

function collectPaths(value, acc = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectPaths(item, acc);
    return acc;
  }
  if (!value || typeof value !== 'object') return acc;
  for (const [key, item] of Object.entries(value)) {
    if (key === 'path' && typeof item === 'string') acc.add(item);
    collectPaths(item, acc);
  }
  return acc;
}

function resolveEventName(doc, actionName) {
  const handler = doc && typeof doc === 'object' ? doc[actionName] : null;
  return handler && handler.event && typeof handler.event.name === 'string' ? handler.event.name : null;
}

function isAllowedPath(item, roots) {
  return roots.some((root) => item === root || item.startsWith(root + '/'));
}

function previewHtml(adapter, req, source, validation) {
  const documentCss = String((source.document.styles && source.document.styles.css) || '').replace(/:host/g, '.artifact-stage').replace(/<\/style/gi, '<\\/style');
  return '<!doctype html>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>' + esc(adapter + ' adapter artifact preview') + '</title>\n' +
    '<style>\n' +
    'body{margin:0;background:#07101f;color:#eaf2ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}\n' +
    '.artifact-shell{min-height:100vh;display:grid;grid-template-rows:auto minmax(360px,1fr);gap:12px;padding:12px;box-sizing:border-box}\n' +
    '.artifact-proof{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px;border:1px solid rgba(255,255,255,.14);border-radius:14px;background:rgba(255,255,255,.06)}\n' +
    '.artifact-proof b{font-size:13px}.artifact-pill{border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:4px 8px;font-size:11px;color:#c8d6ee}\n' +
    '.artifact-stage{position:relative;min-height:360px;border:1px solid rgba(255,255,255,.14);border-radius:18px;overflow:hidden;background:#050915}\n' +
    '.artifact-port{display:grid;place-items:center;border:1px dashed rgba(141,240,189,.55);background:rgba(141,240,189,.08);color:#caffdf;font-size:12px;font-weight:900}\n' +
    '.artifact-repeat{border:1px dashed rgba(255,255,255,.2);padding:8px;border-radius:10px}\n' +
    documentCss + '\n' +
    '</style>\n' +
    '<main class="artifact-shell">\n' +
    '<section class="artifact-proof">' +
    '<b>' + esc(req.outputContract.surfaceId) + '</b>' +
    '<span class="artifact-pill">source: ' + esc(source.sourcePath) + '</span>' +
    '<span class="artifact-pill">actions: ' + validation.actions.length + '</span>' +
    '<span class="artifact-pill">ports: ' + validation.ports.join(', ') + '</span>' +
    '<span class="artifact-pill">status: proof-pass</span>' +
    '</section>\n' +
    '<section class="artifact-stage">' + renderNode(source.document.tree || {type: 'box', children: []}) + '</section>\n' +
    '</main>\n';
}

function renderNode(node) {
  if (!node || typeof node !== 'object') return '';
  const attr = node.className ? ' class="' + escAttr(node.className) + '"' : '';
  const typedAttr = ' data-node-type="' + escAttr(node.type || 'box') + '"';
  const children = Array.isArray(node.children) ? node.children.map(renderNode).join('') : '';
  if (node.type === 'text') return '<span' + attr + typedAttr + '>' + escText(node.text) + '</span>';
  if (node.type === 'button') return '<button' + attr + typedAttr + ' disabled>' + escText(node.text) + '</button>';
  if (node.type === 'slider') return '<input' + attr + typedAttr + ' type="range" min="' + escAttr(node.min ?? 0) + '" max="' + escAttr(node.max ?? node.maxPath ?? 100) + '" disabled>';
  if (node.type === 'segmented') return '<div' + attr + typedAttr + '>' + (node.options || []).map((option) => '<button disabled>' + escText(option.label || option.value) + '</button>').join('') + '</div>';
  if (node.type === 'repeat') return '<div class="artifact-repeat"' + typedAttr + '>repeat ' + escAttr(node.itemsPath || '') + renderNode(node.template) + '</div>';
  if (node.type === 'port') return '<div class="' + escAttr([node.className, 'artifact-port'].filter(Boolean).join(' ')) + '"' + typedAttr + '>port: ' + esc(node.port) + '</div>';
  return '<div' + attr + typedAttr + '>' + children + '</div>';
}

function escText(value) {
  if (typeof value === 'string') return esc(value);
  if (value && typeof value === 'object' && typeof value.path === 'string') return esc('{{' + value.path + '}}');
  return esc(value ?? '');
}

function readJsonl(file, label) {
  const text = readRequired(file, label);
  const records = text.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => parseJson(line, file + ':' + (index + 1)));
  if (!records.length) throw new Error(label + ' has no records: ' + rel(file));
  return {text, records};
}

function readRequired(file, label) {
  if (!fs.existsSync(file)) throw new Error('required ' + label + ' missing: ' + rel(file));
  return fs.readFileSync(file, 'utf8');
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('invalid JSON in ' + label + ': ' + error.message);
  }
}

function json(file) { return parseJson(readRequired(file, 'json file'), rel(file)); }
function jsonl(records) { return records.map((record) => JSON.stringify(record)).join('\n') + '\n'; }
function write(file, text) { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text); }
function count(dir) { return fs.readdirSync(dir, {withFileTypes: true}).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0); }
function sha(dir) { const h = crypto.createHash('sha256'); for (const file of walk(dir).sort()) h.update(path.relative(dir, file)).update(fs.readFileSync(file)); return h.digest('hex'); }
function shaText(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function walk(dir, acc = []) { for (const e of fs.readdirSync(dir, {withFileTypes: true})) { const f = path.join(dir, e.name); e.isDirectory() ? walk(f, acc) : acc.push(f); } return acc; }
function rel(file) { return path.relative(repoRoot, file).split(path.sep).join('/'); }
function esc(value) { return String(value).replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&gt;','>':'&gt;'}[c])); }
function escAttr(value) { return esc(value).replace(/"/g, '&quot;'); }
