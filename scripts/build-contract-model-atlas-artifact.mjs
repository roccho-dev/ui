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
const defaultFixtureRoot = path.join(root, "tests", "fixtures", "contract-model-atlas");

export function buildContractModelAtlasArtifact({ outDir = "contract-model-atlas-artifact", fixtureRoot = defaultFixtureRoot } = {}) {
  const outRoot = path.resolve(outDir);
  const inputRoot = path.resolve(fixtureRoot);
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });

  const contract = readJson(path.join(inputRoot, "contract.json"));
  const registryText = readText(path.join(inputRoot, "registry.json"));
  const shellJsonl = readText(path.join(inputRoot, "shell.v0.9.jsonl"));
  const dataJsonl = readText(path.join(inputRoot, "data.contract-model-atlas.v1.jsonl"));
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
  const html = renderStaticPreview({ surfaceId: contract.surfaceId, shell, state, registry, shellRows, dataRows });
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

function renderStaticPreview({ surfaceId, shell, state, registry, shellRows, dataRows }) {
  const atlas = state.atlas;
  const body = shell.components.map((component) => renderComponent(component, state, {}, new Map(registry.components.map((entry) => [entry.id, entry])))).join("\n");
  const meta = [
    `surface=${surfaceId}`,
    `registry=${registry.components.length}`,
    `shellRows=${shellRows.length}`,
    `dataRows=${dataRows.length}`,
    `containers=${atlas.containers.length}`,
    `elements=${atlas.elements.length}`,
    `edges=${atlas.edges.length}`,
    "adapterOwnsState=false",
    "generatedArtifactsAreAuthority=false",
  ].join(" ");
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="a2ui-surface-id" content="${escapeHtml(surfaceId)}">
<meta name="adapterOwnsState" content="false">
<meta name="generatedArtifactsAreAuthority" content="false">
<title>${escapeHtml(atlas.summary.title)}</title>
<style>
html,body{margin:0;padding:0;background:#fff;color:#111;font:13px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
body{padding:12px}main{max-width:1500px;margin:0 auto}.meta,.a2ui-component{margin:8px 0}.a2ui-text{white-space:pre-wrap;border:1px solid #111;padding:6px}.a2ui-list{border:1px solid #111;padding:6px;max-height:190px;overflow:auto}.a2ui-list ul{margin:0;padding-left:18px}.atlas-svg{width:100%;height:auto;border:1px solid #111;background:#fff}.container{fill:none;stroke:#111;stroke-width:1.3}.element{fill:#fff;stroke:#111;stroke-width:1}.edge{stroke:#111;stroke-width:1;fill:none}.container-label,.element-label,.edge-label{font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;fill:#111}.edge-label{font-size:9px}
</style>
</head>
<body>
<main>
<div class="meta" data-render-source="jsonl-fixture">${escapeHtml(meta)}</div>
<section id="app">
${body}
</section>
</main>
</body>
</html>
`;
}

function renderComponent(component, state, scope, registryMap) {
  validateComponent(component, registryMap);
  const props = component.props || {};
  if (component.component === "Text") {
    return `<section class="a2ui-component a2ui-text" data-component-id="${escapeHtml(component.id)}">${escapeHtml(readValue(props.text, state, scope) ?? "")}</section>`;
  }
  if (component.component === "List") {
    const rows = readValue(props.rows, state, scope);
    const items = (Array.isArray(rows) ? rows : []).map((row) => `<li>${escapeHtml(row)}</li>`).join("");
    return `<section class="a2ui-component a2ui-list" data-component-id="${escapeHtml(component.id)}"><ul>${items}</ul></section>`;
  }
  if (component.component === "Svg") {
    const children = (component.children || []).map((child) => renderSvgChild(child, state, scope, registryMap)).join("");
    return `<svg class="atlas-svg" viewBox="${escapeAttr(readValue(props.viewBox, state, scope) || "0 0 100 100")}" role="img" aria-label="${escapeAttr(readValue(props.ariaLabel, state, scope) || "")}">${children}</svg>`;
  }
  throw new Error(`unsupported top-level component ${component.component}`);
}

function renderSvgChild(component, state, scope, registryMap) {
  validateComponent(component, registryMap);
  const props = component.props || {};
  if (component.component === "ForEach") {
    const rows = readByPath(state, props.path);
    return (Array.isArray(rows) ? rows : []).map((item) => {
      const nextScope = { ...scope, [props.as || "item"]: item };
      return (component.children || []).map((child) => renderSvgChild(child, state, nextScope, registryMap)).join("");
    }).join("");
  }
  if (component.component === "Rect") return renderSvgElement("rect", props, state, scope);
  if (component.component === "Line") return renderSvgElement("line", props, state, scope);
  if (component.component === "SvgText") {
    const { text, ...attrProps } = props;
    return `<text${attrs(attrProps, state, scope)}>${escapeHtml(readValue(text, state, scope) ?? "")}</text>`;
  }
  throw new Error(`unsupported svg component ${component.component}`);
}

function renderSvgElement(tag, props, state, scope) {
  return `<${tag}${attrs(props, state, scope)}></${tag}>`;
}

function attrs(props, state, scope) {
  return Object.entries(props || {}).map(([key, value]) => {
    const resolved = readValue(value, state, scope);
    if (resolved == null) return "";
    return ` ${key}="${escapeAttr(resolved)}"`;
  }).join("");
}

function readValue(value, state, scope) {
  if (value && typeof value === "object" && typeof value.path === "string" && !value.var) return readByPath(state, value.path);
  if (value && typeof value === "object" && typeof value.var === "string") return readByPath(scope[value.var], value.path || "");
  return value;
}

function readByPath(root, pointer) {
  if (!pointer || pointer === "/") return root;
  return String(pointer).split("/").filter(Boolean).reduce((acc, key) => acc == null ? undefined : acc[key], root);
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
function escapeAttr(value) { return escapeHtml(value).replaceAll("'", "&#39;"); }

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  const fixtureIndex = argv.indexOf("--fixture-root");
  return {
    outDir: outIndex >= 0 ? argv[outIndex + 1] : (argv[0] || "contract-model-atlas-artifact"),
    fixtureRoot: fixtureIndex >= 0 ? argv[fixtureIndex + 1] : defaultFixtureRoot,
  };
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
