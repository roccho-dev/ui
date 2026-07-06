import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyDataCartridge,
  compileShell,
  jsonlLines,
  parseJsonlLines,
  sha256,
  validateDataCartridgeRows,
  validateShellRows,
} from "#core-port/a2ui-shell-builder";
import {
  assertContractModelAtlasView,
  contractModelAtlasDigest,
  makeContractModelAtlasReceipt,
} from "#core-port/contract-model-atlas-view";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "tests", "fixtures", "contract-model-atlas");

export function buildContractModelAtlasArtifact({ outDir = "contract-model-atlas-artifact" } = {}) {
  const outRoot = path.resolve(outDir);
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });

  const contract = readJson(path.join(fixtureRoot, "contract.json"));
  const registryText = readText(path.join(fixtureRoot, "registry.json"));
  const shellJsonl = readText(path.join(fixtureRoot, "shell.v0.9.jsonl"));
  const dataJsonl = readText(path.join(fixtureRoot, "data.contract-model-atlas.v1.jsonl"));
  const registry = JSON.parse(registryText);
  const registryMap = buildRegistry(registry);
  const shellRows = parseJsonlLines(shellJsonl);
  const dataRows = parseJsonlLines(dataJsonl);

  validateShellRows(shellRows, contract);
  validateDataCartridgeRows(dataRows, contract);
  validateShellComponents(shellRows, registryMap);
  const shell = compileShell(shellRows, contract);
  const state = applyDataCartridge(dataRows, contract);
  const atlas = assertContractModelAtlasView(state.atlas);
  const html = renderExternalJsonlHost({ surfaceId: contract.surfaceId });
  const files = {
    "preview/index.html": html,
    "source/contract.json": JSON.stringify(contract, null, 2) + "\n",
    "source/registry.json": JSON.stringify(registry, null, 2) + "\n",
    "source/shell.v0.9.jsonl": jsonlLines(shellRows),
    "source/data.contract-model-atlas.v1.jsonl": jsonlLines(dataRows),
    "proof/compiled-shell.json": JSON.stringify(shell, null, 2) + "\n",
  };

  const receipt = makeContractModelAtlasReceipt({
    surfaceId: contract.surfaceId,
    shellDigest: shell.shellDigest,
    dataDigest: sha256(state),
    htmlDigest: sha256(html),
    viewDigest: contractModelAtlasDigest(atlas),
    files: Object.keys(files),
  });
  files["proof/contract-model-atlas-receipt.json"] = JSON.stringify(receipt, null, 2) + "\n";
  files["artifact-summary.json"] = JSON.stringify({
    kind: "ui.contractModelAtlas.artifactSummary.v1",
    status: "PASS",
    surfaceId: contract.surfaceId,
    source: "checked-in Contract Model Atlas JSONL fixtures",
    files: Object.keys(files).sort(),
    adapterOwnsState: false,
    generatedArtifactsAreAuthority: false,
  }, null, 2) + "\n";

  for (const [relativePath, text] of Object.entries(files)) write(path.join(outRoot, relativePath), text);
  write(path.join(outRoot, "MANIFEST.sha256"), manifest(outRoot));
  return { outRoot, contract, shell, state, atlas, html, receipt, files: collectFiles(outRoot) };
}

function buildRegistry(registry) {
  if (!registry || registry.kind !== "ui.component.registry.v1") throw new Error("invalid registry kind");
  const map = new Map();
  for (const entry of registry.components || []) {
    if (!entry.id) throw new Error("registry entry missing id");
    if (map.has(entry.id)) throw new Error(`duplicate component id ${entry.id}`);
    map.set(entry.id, entry);
  }
  return map;
}

function validateShellComponents(rows, registryMap) {
  for (const row of rows) for (const component of row.updateComponents?.components || []) validateComponent(component, registryMap);
}

function validateComponent(component, registryMap) {
  const entry = registryMap.get(component.component);
  if (!entry) throw new Error(`unknown component ${component.component}`);
  const allowed = new Set(entry.props || []);
  for (const key of Object.keys(component.props || {})) {
    if (!allowed.has(key)) throw new Error(`component ${component.component} has undeclared prop ${key}`);
  }
  for (const child of component.children || []) validateComponent(child, registryMap);
}

function renderExternalJsonlHost({ surfaceId }) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="a2ui-surface-id" content="${escapeHtml(surfaceId)}">
<meta name="adapterOwnsState" content="false">
<meta name="generatedArtifactsAreAuthority" content="false">
<title>Contract Model Atlas A2UI Preview</title>
<style>
html,body{margin:0;padding:0;background:#fff;color:#111;font:13px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
body{padding:12px}main{max-width:1500px;margin:0 auto}.meta,.a2ui-component{margin:8px 0}.a2ui-text{white-space:pre-wrap;border:1px solid #111;padding:6px}.a2ui-list{border:1px solid #111;padding:6px;max-height:190px;overflow:auto}.a2ui-list ul{margin:0;padding-left:18px}.atlas-svg{width:100%;height:auto;border:1px solid #111;background:#fff}.container{fill:none;stroke:#111;stroke-width:1.3}.element{fill:#fff;stroke:#111;stroke-width:1}.edge{stroke:#111;stroke-width:1;fill:none}.container-label,.element-label,.edge-label{font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;fill:#111}.edge-label{font-size:9px}.load-error{border:1px solid #111;padding:8px;white-space:pre-wrap}
</style>
</head>
<body>
<main>
<div class="meta" id="meta">loading external A2UI registry, shell JSONL, and data JSONL</div>
<section id="app"></section>
</main>
<script>
main().catch((error) => {
  document.getElementById('meta').textContent = 'render failed';
  const el = document.createElement('pre');
  el.className = 'load-error';
  el.textContent = error.stack || String(error);
  document.getElementById('app').replaceChildren(el);
});

async function main() {
  const registry = JSON.parse(await fetchText('../source/registry.json'));
  const shellRows = parseJsonl(await fetchText('../source/shell.v0.9.jsonl'));
  const dataRows = parseJsonl(await fetchText('../source/data.contract-model-atlas.v1.jsonl'));
  const registryMap = buildRegistry(registry);
  const shell = compileShell(shellRows, registryMap);
  const state = applyDataRows(dataRows, shell.contract);
  const surface = renderSurface(shell, state, registryMap);
  const atlas = state.atlas || {};
  document.getElementById('meta').textContent = 'external preview: registry=' + registry.components.length + ' shellRows=' + shellRows.length + ' dataRows=' + dataRows.length + ' containers=' + (atlas.containers?.length || 0) + ' elements=' + (atlas.elements?.length || 0) + ' edges=' + (atlas.edges?.length || 0);
  document.getElementById('app').replaceChildren(surface);
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('failed to load ' + url + ': ' + response.status);
  return response.text();
}

function parseJsonl(text) {
  return String(text || '').replaceAll(String.fromCharCode(13), '').split(String.fromCharCode(10)).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error('invalid JSONL line ' + (index + 1) + ': ' + error.message); }
  });
}

function buildRegistry(registry) {
  if (!registry || registry.kind !== 'ui.component.registry.v1') throw new Error('invalid registry kind');
  const map = new Map();
  for (const entry of registry.components || []) {
    if (!entry.id) throw new Error('registry entry missing id');
    if (map.has(entry.id)) throw new Error('duplicate component id ' + entry.id);
    map.set(entry.id, entry);
  }
  return map;
}

function compileShell(rows, registryMap) {
  const createRows = rows.filter((row) => row.createSurface);
  const updateRows = rows.filter((row) => row.updateComponents);
  if (rows.some((row) => row.updateDataModel)) throw new Error('shell must not contain updateDataModel');
  if (createRows.length !== 1) throw new Error('shell requires exactly one createSurface');
  const surfaceId = createRows[0].createSurface.surfaceId;
  const components = updateRows.flatMap((row) => {
    if (row.updateComponents.surfaceId !== surfaceId) throw new Error('surfaceId mismatch in updateComponents');
    return row.updateComponents.components || [];
  });
  for (const component of components) validateComponent(component, registryMap);
  return { kind:'ui.a2ui.compiled-shell.v1', surfaceId, components, contract:{ surfaceId, allowedUpdatePaths:['/atlas'] }, generatedArtifactsAreAuthority:false };
}

function validateComponent(component, registryMap) {
  const entry = registryMap.get(component.component);
  if (!entry) throw new Error('unknown component ' + component.component);
  const allowedProps = new Set(entry.props || []);
  for (const key of Object.keys(component.props || {})) {
    if (!allowedProps.has(key)) throw new Error('component ' + component.component + ' has undeclared prop ' + key);
  }
  for (const child of component.children || []) validateComponent(child, registryMap);
}

function applyDataRows(rows, contract) {
  let state = {};
  for (const row of rows) {
    if (!row.updateDataModel) throw new Error('data JSONL may contain only updateDataModel rows');
    const msg = row.updateDataModel;
    if (msg.surfaceId !== contract.surfaceId) throw new Error('data surfaceId mismatch');
    if (!contract.allowedUpdatePaths.includes(msg.path)) throw new Error('undeclared data path ' + msg.path);
    state = setPath(state, msg.path, msg.value);
  }
  return state;
}

function renderSurface(shell, state, registryMap) {
  const frag = document.createDocumentFragment();
  for (const component of shell.components) frag.appendChild(renderComponent(component, state, {}, registryMap));
  const wrap = document.createElement('div');
  wrap.appendChild(frag);
  return wrap;
}

function renderComponent(component, state, scope, registryMap) {
  validateComponent(component, registryMap);
  const props = component.props || {};
  if (component.component === 'Text') {
    const el = document.createElement('section');
    el.className = 'a2ui-component a2ui-text';
    el.textContent = String(readValue(props.text, state, scope) ?? '');
    return el;
  }
  if (component.component === 'List') {
    const el = document.createElement('section');
    el.className = 'a2ui-component a2ui-list';
    const ul = document.createElement('ul');
    const rows = readValue(props.rows, state, scope);
    for (const row of Array.isArray(rows) ? rows : []) {
      const li = document.createElement('li');
      li.textContent = String(row);
      ul.appendChild(li);
    }
    el.appendChild(ul);
    return el;
  }
  if (component.component === 'Svg') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'atlas-svg');
    svg.setAttribute('viewBox', String(readValue(props.viewBox, state, scope) || '0 0 100 100'));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', String(readValue(props.ariaLabel, state, scope) || ''));
    for (const child of component.children || []) appendSvgChild(svg, child, state, scope, registryMap);
    return svg;
  }
  throw new Error('unsupported top-level component ' + component.component);
}

function appendSvgChild(parent, component, state, scope, registryMap) {
  validateComponent(component, registryMap);
  const props = component.props || {};
  if (component.component === 'ForEach') {
    const rows = readByPath(state, props.path);
    for (const item of Array.isArray(rows) ? rows : []) {
      const nextScope = { ...scope, [props.as || 'item']: item };
      for (const child of component.children || []) appendSvgChild(parent, child, state, nextScope, registryMap);
    }
    return;
  }
  const tag = component.component === 'Rect' ? 'rect' : component.component === 'Line' ? 'line' : component.component === 'SvgText' ? 'text' : null;
  if (!tag) throw new Error('unsupported svg component ' + component.component);
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(props)) {
    const v = readValue(value, state, scope);
    if (component.component === 'SvgText' && key === 'text') el.textContent = String(v ?? '');
    else if (v != null) el.setAttribute(key, String(v));
  }
  parent.appendChild(el);
}

function readValue(value, state, scope) {
  if (value && typeof value === 'object' && typeof value.path === 'string' && !value.var) return readByPath(state, value.path);
  if (value && typeof value === 'object' && typeof value.var === 'string') return readByPath(scope[value.var], value.path || '');
  return value;
}
function readByPath(root, path) { if (!path || path === '/') return root; return String(path).split('/').filter(Boolean).reduce((acc, key) => acc == null ? undefined : acc[key], root); }
function setPath(root, path, value) { const out = structuredClone(root); const parts = String(path).split('/').filter(Boolean); let cur = out; for (const key of parts.slice(0, -1)) cur = cur[key] ??= {}; cur[parts.at(-1)] = structuredClone(value); return out; }
</script>
</body>
</html>
`;
}

function manifest(dir) {
  return collectFiles(dir)
    .filter((file) => file !== "MANIFEST.sha256")
    .map((file) => `${sha256(fs.readFileSync(path.join(dir, file), "utf8"))}  ${file}`)
    .join("\n") + "\n";
}

function collectFiles(dir, prefix = "") {
  const files = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (fs.statSync(full).isDirectory()) files.push(...collectFiles(full, rel));
    else files.push(rel);
  }
  return files;
}

function readText(file) { return fs.readFileSync(file, "utf8"); }
function readJson(file) { return JSON.parse(readText(file)); }
function write(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text, "utf8"); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

function parseArgs(argv) {
  const index = argv.indexOf("--out");
  if (index >= 0) return { outDir: argv[index + 1] };
  return { outDir: argv[0] || "contract-model-atlas-artifact" };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildContractModelAtlasArtifact(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({
    status: "contract-model-atlas-artifact-built",
    outRoot: result.outRoot,
    surfaceId: result.contract.surfaceId,
    files: result.files,
    generatedArtifactsAreAuthority: false,
  }, null, 2));
}
