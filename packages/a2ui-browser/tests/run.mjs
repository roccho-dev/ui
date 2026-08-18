import assert from "node:assert/strict";
import { createBaseCatalog, createClientAction, renderTrustedSurface, validateComponent } from "../src/index.mjs";
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
const document = { createElement: makeElement };
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
assert.throws(() => renderTrustedSurface({ components: [{ id: "root", component: "Column", children: ["missing"] }], document, mount }));
assert.throws(() => renderTrustedSurface({ components: [{ id: "root", component: "Column", children: ["root"] }], document, mount }));
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
console.log("a2ui-browser-tests-pass 17");
