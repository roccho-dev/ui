import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defaultRegistry, projectA2uiSurface, projectQuestionnaireFlow } from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "dist");

function readJsonl(rel) {
  return fs
    .readFileSync(path.join(root, rel), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => JSON.parse(line));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function nodeLabel(node) {
  const props = node?.props || {};
  return props.text || props.label || props.title || props.value || node?.id || node?.type || "node";
}

function renderNode(node) {
  if (!node) return "";
  const children = (node.children || []).map(renderNode).join("\n");
  const status = node.registered ? "registered" : "unknown";
  return `
    <li class="node ${status}">
      <div class="node-head">
        <span class="type">${escapeHtml(node.type)}</span>
        <span class="family">${escapeHtml(node.family || "no-family")}</span>
        <span class="status">${escapeHtml(status)}</span>
      </div>
      <div class="label">${escapeHtml(nodeLabel(node))}</div>
      ${children ? `<ul>${children}</ul>` : ""}
    </li>`;
}

function renderSurface(title, surface) {
  const tree = surface.tree;
  const unknownTypes = tree?.unknownTypes || [];
  return `
    <section class="surface">
      <h2>${escapeHtml(title)}</h2>
      <dl>
        <dt>kind</dt><dd>${escapeHtml(surface.kind)}</dd>
        <dt>hasTree</dt><dd>${escapeHtml(surface.hasTree)}</dd>
        <dt>nodeCount</dt><dd>${escapeHtml(tree?.nodeCount ?? 0)}</dd>
        <dt>unknownTypes</dt><dd>${escapeHtml(unknownTypes.length ? unknownTypes.join(", ") : "none")}</dd>
        <dt>emittableEvents</dt><dd>${escapeHtml((surface.emittableEvents || []).join(", ") || "none")}</dd>
      </dl>
      <ul class="tree">${renderNode(tree?.root)}</ul>
    </section>`;
}

const registry = defaultRegistry();
const a2uiView = projectA2uiSurface(readJsonl("fixtures/a2ui-recursive.demo.jsonl"), registry);
const flowView = projectQuestionnaireFlow(readJsonl("fixtures/questionnaire.flow.jsonl"), registry);

const viewModel = {
  kind: "ui.static-html-build.v1",
  generatedFrom: ["fixtures/a2ui-recursive.demo.jsonl", "fixtures/questionnaire.flow.jsonl"],
  registry: {
    kind: registry.kind,
    componentCount: registry.list().length,
    families: registry.families(),
  },
  surfaces: {
    a2ui: a2uiView,
    questionnaire: flowView,
  },
};

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ui static build</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin: 2rem; line-height: 1.5; }
    header, section { max-width: 980px; margin: 0 auto 2rem; }
    .summary { display: flex; gap: 1rem; flex-wrap: wrap; }
    .card { border: 1px solid currentColor; border-radius: 0.75rem; padding: 1rem; min-width: 12rem; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.4rem 1rem; }
    dt { font-weight: 700; }
    .tree, .tree ul { list-style: none; padding-left: 1rem; }
    .node { border-left: 2px solid currentColor; margin: 0.5rem 0; padding: 0.5rem 0.75rem; }
    .node-head { display: flex; gap: 0.5rem; flex-wrap: wrap; font-size: 0.85rem; }
    .type { font-weight: 700; }
    .family, .status { opacity: 0.75; }
    .label { margin-top: 0.25rem; }
    pre { overflow: auto; padding: 1rem; border: 1px solid currentColor; border-radius: 0.75rem; }
  </style>
</head>
<body>
  <header>
    <h1>ui static build</h1>
    <p>Renderer-neutral UI projection built from JSONL fixtures. This HTML is a non-authority preview artifact.</p>
    <div class="summary">
      <div class="card"><strong>registry</strong><br>${escapeHtml(registry.kind)}</div>
      <div class="card"><strong>components</strong><br>${escapeHtml(registry.list().length)}</div>
      <div class="card"><strong>families</strong><br>${escapeHtml(registry.families().join(", "))}</div>
    </div>
  </header>
  ${renderSurface("A2UI recursive surface", a2uiView)}
  ${renderSurface("Questionnaire flow surface", flowView)}
  <section>
    <h2>Build payload</h2>
    <pre>${escapeHtml(JSON.stringify(viewModel, null, 2))}</pre>
  </section>
</body>
</html>
`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.html"), html);
fs.writeFileSync(path.join(outDir, "view-model.json"), JSON.stringify(viewModel, null, 2) + "\n");

console.log(JSON.stringify({ status: "ui-static-html-build-ok", files: ["dist/index.html", "dist/view-model.json"] }));
