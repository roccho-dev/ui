import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defaultRegistry } from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = path.join(root, "packages/purpose-atlas-a2ui-surface");

function read(rel) {
  return fs.readFileSync(path.join(pkg, rel), "utf8");
}

function readJsonl(rel) {
  return read(rel)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

assert.ok(fs.existsSync(pkg), "purpose atlas A2UI surface package must exist");
for (const forbidden of ["golden", "dist", "node_modules"]) {
  assert.equal(fs.existsSync(path.join(pkg, forbidden)), false, `${forbidden} must not be committed`);
}
assert.ok(!read("package-lock.json").includes("packages.applied-caas-gateway1.internal.api.openai.org"), "lockfile must not pin internal registry URLs");

const registry = defaultRegistry();
const expectedComponents = [
  "AtlasShell",
  "AtlasHeader",
  "AtlasToolbar",
  "AtlasCanvas",
  "AtlasInspector",
  "AtlasToast",
];
const expectedActions = [
  "atlas.reset",
  "atlas.previous",
  "atlas.next",
  "atlas.togglePlay",
  "atlas.stepChanged",
  "atlas.modeChanged",
  "atlas.fit",
  "atlas.zoomIn",
  "atlas.zoomOut",
  "atlas.select",
  "atlas.recordMismatch",
  "atlas.requestOwner",
  "atlas.holdDecision",
  "atlas.stepForward",
  "atlas.clearSelection",
];
const allowedRoots = new Set(["meta", "ui", "atlas", "inspector", "events", "operations", "toast", "runtime"]);
const allowedProps = new Map([
  ["AtlasShell", new Set(["id", "component", "header", "toolbar", "canvas", "inspector", "toast"])],
  ["AtlasHeader", new Set(["id", "component", "title", "subtitle", "step", "maxStep", "guard", "counts", "composition", "protocol"])],
  ["AtlasToolbar", new Set(["id", "component", "step", "maxStep", "playing", "viewMode", "events", "onReset", "onPrevious", "onNext", "onTogglePlay", "onStepChanged", "onModeChanged", "onFit", "onZoomIn", "onZoomOut"])],
  ["AtlasCanvas", new Set(["id", "component", "snapshot", "viewport", "selection", "viewMode", "onSelect"])],
  ["AtlasInspector", new Set(["id", "component", "details", "guard", "eventLog", "cxo", "operations", "lastEvent", "onRecordMismatch", "onRequestOwner", "onHoldDecision", "onStepForward", "onClearSelection"])],
  ["AtlasToast", new Set(["id", "component", "toast"])],
]);

function collectActions(value, output = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectActions(item, output);
  } else if (value && typeof value === "object") {
    if (value.event?.name) output.add(value.event.name);
    for (const item of Object.values(value)) collectActions(item, output);
  }
  return output;
}

function assertNoExecutablePayload(value, label = "surface") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoExecutablePayload(item, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    assert.notEqual(key, "call", `${label} must not contain executable call payload`);
    assert.notEqual(key, "functionCall", `${label} must not contain executable functionCall payload`);
    if (typeof item === "string") {
      assert.ok(!/javascript:|<script|\beval\s*\(/i.test(item), `${label}.${key} must not contain executable text`);
    }
    assertNoExecutablePayload(item, `${label}.${key}`);
  }
}

function assertBindingPath(value, label) {
  if (!value || typeof value !== "object" || !("path" in value)) return;
  assert.equal(typeof value.path, "string", `${label}.path must be string`);
  assert.ok(value.path.startsWith("/"), `${label}.path must be absolute`);
  if (value.path === "/") return;
  assert.ok(!value.path.includes(".."), `${label}.path must not traverse`);
  const rootName = value.path.split("/")[1];
  assert.ok(allowedRoots.has(rootName), `${label}.path root must be allowed: ${value.path}`);
}

function assertBindings(value, label = "surface") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertBindings(item, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  assertBindingPath(value, label);
  for (const [key, item] of Object.entries(value)) assertBindings(item, `${label}.${key}`);
}

for (const id of expectedComponents) {
  const entry = registry.get(id);
  assert.ok(entry, `${id} must be registered`);
  assert.equal(entry.family, "purpose_atlas");
  assert.deepEqual(entry.allowedSurfaceIds, ["purpose-atlas"]);
}

const surface = readJsonl("public/a2ui/purpose-atlas.surface.jsonl");
assert.equal(surface.length, 3, "surface must be native A2UI v0.9 create/update/updateDataModel");
assert.equal(surface[0].createSurface.surfaceId, "purpose-atlas");
assert.equal(surface[0].createSurface.catalogId, "https://visualize-layers.dev/a2ui/catalogs/purpose-atlas/v6");

const components = surface[1].updateComponents.components;
assert.equal(components.length, 6, "surface must describe the UI as addressable A2UI components");
assert.deepEqual(components.map((component) => component.component), expectedComponents);
for (const component of components) {
  assert.ok(registry.has(component.component), `${component.component} must be registry backed`);
  const props = allowedProps.get(component.component);
  assert.ok(props, `${component.component} must have a static prop allowlist`);
  for (const key of Object.keys(component)) {
    assert.ok(props.has(key), `${component.component} declares unsupported prop ${key}`);
  }
}
assertNoExecutablePayload(surface);
assertBindings(surface);

const surfaceActions = [...collectActions(surface)].sort();
const registryActions = [
  ...new Set(
    registry
      .list()
      .filter((entry) => entry.family === "purpose_atlas")
      .flatMap((entry) => entry.actions),
  ),
].sort();
assert.deepEqual(surfaceActions, expectedActions.slice().sort(), "surface actions must equal the 15 Atlas action allowlist");
assert.deepEqual(registryActions, expectedActions.slice().sort(), "registry actions must equal the 15 Atlas action allowlist");

const initialModel = surface[2].updateDataModel.value;
assert.ok(initialModel.ui);
assert.ok(initialModel.atlas);
assert.ok(initialModel.inspector);

const proposal = fs.readFileSync(path.join(root, "docs/proposals/purpose-atlas-a2ui-described-surface-260618.md"), "utf8");
assert.ok(proposal.includes("supersedes the golden-witness import direction"));
assert.ok(proposal.includes("raw JSONL in repos"));
assert.ok(proposal.includes("resolved a2ui.context.surface.v1"));

console.log(JSON.stringify({
  status: "purpose-atlas-a2ui-surface-check-pass",
  components: components.length,
  actions: surfaceActions.length,
  catalogId: surface[0].createSurface.catalogId,
}, null, 2));
