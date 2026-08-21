import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARTIFACT_RUNTIME_JSONL_RECEIPT_SCHEMA,
  compileArtifactRuntimeJsonlSurface,
  createAtlasStageCatalog,
  renderTrustedSurface,
} from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fixture = id => fs.readFileSync(path.join(root, "tests/fixtures/artifact-runtime-jsonl", `${id}.jsonl`), "utf8");
const makeElement = tagName => ({
  attributes: new Map(), children: [], tagName, textContent: "", type: "",
  addEventListener() {},
  append(...values) { this.children.push(...values); },
  replaceChildren(...values) { this.children = [...values]; },
  setAttribute(name, value) { this.attributes.set(name, String(value)); },
});
const document = { createElement: makeElement, createElementNS: (_namespace, name) => makeElement(name) };
const find = (node, predicate) => {
  if (predicate(node)) return node;
  for (const child of node?.children ?? []) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
};

const expected = {
  base: { components: 4, nodes: 0, edges: 0, title: "A2UI Base" },
  graph: { components: 3, nodes: 4, edges: 3, title: "Graph Canvas" },
  map: { components: 3, nodes: 5, edges: 4, title: "Semantic Map Canvas" },
  seq: { components: 3, nodes: 6, edges: 5, title: "Sequence Canvas" },
};
let assertions = 0;
for (const [id, want] of Object.entries(expected)) {
  const compiled = compileArtifactRuntimeJsonlSurface({ jsonl: fixture(id) });
  assert.equal(compiled.receipt.schema, ARTIFACT_RUNTIME_JSONL_RECEIPT_SCHEMA); assertions += 1;
  assert.equal(compiled.receipt.status, "PASS"); assertions += 1;
  assert.equal(compiled.receipt.rowCount, 2); assertions += 1;
  assert.equal(compiled.receipt.componentCount, want.components); assertions += 1;
  assert.equal(compiled.surface.dataModel.title, want.title); assertions += 1;
  const mount = makeElement("mount");
  const rendered = renderTrustedSurface({
    catalog: createAtlasStageCatalog(),
    components: compiled.surface.components,
    dataModel: compiled.surface.dataModel,
    document,
    mount,
    rootId: compiled.surface.rootId,
    surfaceId: compiled.surface.surfaceId,
  });
  assert.equal(rendered.componentCount, want.components); assertions += 1;
  const svg = find(mount, node => node?.attributes?.get("data-atlas-stage") === "svg");
  if (id === "base") {
    assert.equal(svg, null); assertions += 1;
  } else {
    assert.ok(svg); assertions += 1;
    assert.equal(Number(svg.attributes.get("data-atlas-node-count")), want.nodes); assertions += 1;
    assert.equal(Number(svg.attributes.get("data-atlas-edge-count")), want.edges); assertions += 1;
  }
}

assert.throws(() => compileArtifactRuntimeJsonlSurface({ jsonl: '{"type":"TreePatch","props":{"op":"replace"},"children":[{"type":"Unknown","id":"root","props":{},"children":[]}]}' }), /unregistered components/u); assertions += 1;
assert.throws(() => compileArtifactRuntimeJsonlSurface({ jsonl: '{"type":"TreePatch","props":{"op":"replace"},"children":[{"type":"Column","id":"root","props":{},"children":[{"type":"Text","id":"same","props":{"text":"a"},"children":[]},{"type":"Text","id":"same","props":{"text":"b"},"children":[]}]}]}' }), /duplicate component same/u); assertions += 1;
assert.throws(() => compileArtifactRuntimeJsonlSurface({ jsonl: '{"type":"TreePatch","props":{"op":"replace"},"children":[{"type":"Column","id":"root","props":{},"children":[{"type":"Text","id":"root","props":{"text":"duplicate ancestor"},"children":[]}]}]}' }), /duplicate component root/u); assertions += 1;
assert.throws(() => compileArtifactRuntimeJsonlSurface({ jsonl: '{"type":"TreePatch","props":{"op":"replace"},"children":[{"type":"Text","id":"root","props":{"text":"x","id":"override"},"children":[]}]}' }), /props.id is reserved/u); assertions += 1;
assert.throws(() => compileArtifactRuntimeJsonlSurface({ jsonl: '{"type":"TreePatch","props":{"op":"replace"},"children":[{"type":"AtlasStage","id":"root","props":{"viewBox":{"x":0,"y":0,"width":100,"height":100},"nodes":[{"id":"a","label":"A","x":0,"y":0,"width":10,"height":10}],"edges":[{"id":"bad","from":"a","to":"missing"}]},"children":[]}]}' }), /references missing missing/u); assertions += 1;
assert.throws(() => compileArtifactRuntimeJsonlSurface({ jsonl: '{"type":"TreePatch","props":{"op":"replace"},"children":[{"type":"Text","id":"root","props":{"text":"x"},"children":[]}]}\n{"type":"StatePatch","props":{"op":"merge","value":{"__proto__":{"polluted":true}}},"children":[]}' }), /unsafe state key __proto__/u); assertions += 1;
assert.throws(() => compileArtifactRuntimeJsonlSurface({ jsonl: '{"type":"TreePatch","props":{"op":"replace"},"children":[{"type":"Text","id":"root","props":{"text":"x"},"children":[]}]}\n{"type":"StatePatch","props":{"op":"set","path":"/constructor/polluted","value":true},"children":[]}' }), /unsafe state key constructor/u); assertions += 1;
assert.throws(() => compileArtifactRuntimeJsonlSurface({ jsonl: '{bad' }), /JSONL line 1 is invalid/u); assertions += 1;

console.log(JSON.stringify({
  schema: "check-receipt/1",
  checkId: "ui.a2ui-browser.jsonl-surface",
  ownerRepo: "ui",
  lane: "repo",
  kind: "normal",
  status: "PASS",
  assertions,
  fixtures: Object.keys(expected),
}));
