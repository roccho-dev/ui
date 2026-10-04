import assert from "node:assert/strict";
import {
  ATLAS_STAGE_CATALOG_ID,
  createAtlasStageCatalog,
  createBaseCatalog,
  createClientAction,
  renderTrustedSurface,
  validateAtlasStageComponent,
  validateComponent,
} from "../src/index.mjs";
import { createIncrementalSurfaceRuntime } from "../src/incremental-surface.mjs";

const makeElement = tagName => {
  const listeners = new Map();
  return {
    attributes: new Map(), children: [], tagName, textContent: "", type: "",
    addEventListener: (name, listener) => listeners.set(name, listener),
    append(...values) { this.children.push(...values); },
    click() { listeners.get("click")?.(); },
    replaceChildren(...values) { this.children = [...values]; },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
  };
};
const document = {
  createElement: makeElement,
  createElementNS: (_namespace, name) => makeElement(name),
};
const mount = makeElement("mount");
const events = [];
const eventTarget = { dispatchEvent: event => { events.push(event); return true; } };
const components = [
  { id: "root", component: "Column", children: ["title", "card", "divider", "button"] },
  { id: "title", component: "Text", text: "<b>literal</b>", variant: "h1" },
  { id: "card", component: "Card", children: ["body"] },
  { id: "body", component: "Text", text: "body" },
  { id: "divider", component: "Divider" },
  { id: "button", component: "Button", label: "go", action: "continue-conversation", context: { head: "sha256:test" } },
];
const result = renderTrustedSurface({ components, document, eventTarget, mount });
assert.equal(result.componentCount, 6);
assert.equal(mount.children[0].children[0].textContent, "<b>literal</b>");
mount.children[0].children[3].click();
assert.equal(events[0].detail.action, "continue-conversation");
assert.equal(createBaseCatalog().id, "urn:roccho:a2ui:catalog:base:1");
assert.equal(createBaseCatalog().components.length, 5);
assert.equal(createClientAction({ action: "x", context: {}, sourceComponentId: "b" }).version, "v0.9.1");
assert.throws(() => validateComponent({ id: "x", component: "Script", code: "x" }));
const boundMount = makeElement("bound-mount");
renderTrustedSurface({ components: [{ id: "root", component: "Text", path: "/count", variant: "h2" }], dataModel: { count: 7 }, document, mount: boundMount });
assert.equal(boundMount.children[0].textContent, "7");
assert.throws(() => validateComponent({ id: "x", component: "Text", text: "x", path: "/count" }));
assert.throws(() => validateComponent({ id: "x", component: "Text", path: "/__proto__/x" }));
assert.throws(() => renderTrustedSurface({ components: [{ id: "root", component: "Column", children: ["missing"] }], document, mount }));
assert.throws(() => renderTrustedSurface({ components: [{ id: "root", component: "Column", children: ["root"] }], document, mount }));

const atlasComponent = {
  id: "atlas",
  component: "AtlasStage",
  ariaLabel: "Atlas canvas proof",
  viewBox: { x: 0, y: 0, width: 640, height: 360 },
  nodes: [
    { id: "region", label: "Region", kind: "region", x: 20, y: 20, width: 600, height: 320 },
    { id: "input", label: "Input", kind: "data", parentId: "region", x: 70, y: 130, width: 140, height: 70 },
    { id: "output", label: "Output", kind: "node", parentId: "region", x: 430, y: 130, width: 140, height: 70 },
  ],
  edges: [{ id: "flow", from: "input", to: "output", kind: "flow", label: "compile" }],
};
const atlasCatalog = createAtlasStageCatalog();
assert.equal(atlasCatalog.id, ATLAS_STAGE_CATALOG_ID);
assert.equal(atlasCatalog.components.length, 6);
assert.equal(createBaseCatalog().components.length, 5);
assert.equal(validateAtlasStageComponent(atlasComponent).nodes.length, 3);
const atlasMount = makeElement("atlas-mount");
const atlasResult = renderTrustedSurface({ catalog: atlasCatalog, components: [atlasComponent], document, mount: atlasMount, rootId: "atlas" });
assert.equal(atlasResult.componentCount, 1);
assert.equal(atlasMount.children[0].tagName, "svg");
assert.equal(atlasMount.children[0].attributes.get("data-atlas-stage"), "svg");
assert.equal(atlasMount.children[0].attributes.get("data-atlas-node-count"), "3");
assert.equal(atlasMount.children[0].attributes.get("data-atlas-edge-count"), "1");
assert.throws(() => validateAtlasStageComponent({ ...atlasComponent, edges: [{ id: "bad", from: "input", to: "missing" }] }), /missing missing/u);
assert.throws(() => validateAtlasStageComponent({ ...atlasComponent, nodes: [atlasComponent.nodes[0], atlasComponent.nodes[0]] }), /duplicate node/u);
assert.throws(() => validateAtlasStageComponent({ ...atlasComponent, nodes: [{ ...atlasComponent.nodes[0], parentId: "__proto__" }] }), /parentId is invalid/u);
assert.throws(() => validateAtlasStageComponent({ ...atlasComponent, nodes: Array.from({ length: 97 }, (_, index) => ({ id: `n${index}`, label: `n${index}`, x: index, y: 0, width: 10, height: 10 })), edges: [] }), /1-96/u);
assert.throws(() => validateAtlasStageComponent({ ...atlasComponent, script: "no" }), /script is not allowed/u);

const incrementalMount = makeElement("incremental-mount");
const incremental = createIncrementalSurfaceRuntime({ document, eventTarget, mount: incrementalMount });
incremental.apply([
  { version: "v0.9", createSurface: { surfaceId: "main", catalogId: "urn:roccho:a2ui:catalog:base:1", sendDataModel: true } },
  { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/", value: { revision: 1 } } },
  { version: "v0.9", updateComponents: { surfaceId: "main", components: [{ id: "root", component: "Text", text: "first" }] } },
]);
assert.equal(incremental.read().state.revision, 1);
assert.equal(incrementalMount.children[0].textContent, "first");
incremental.apply([
  { version: "v0.9", updateDataModel: { surfaceId: "main", path: "/revision", value: 2 } },
  { version: "v0.9", updateComponents: { surfaceId: "main", components: [{ id: "root", component: "Text", text: "second" }] } },
]);
assert.equal(incremental.read().state.dataModel.revision, 2);
assert.equal(incremental.read().state.revision, 2);
assert.equal(incrementalMount.children[0].textContent, "second");
assert.throws(() => incremental.apply([{ version: "v0.9", createSurface: { surfaceId: "main", catalogId: "urn:roccho:a2ui:catalog:base:1" } }]));
console.log("a2ui-browser-tests-pass 31");
