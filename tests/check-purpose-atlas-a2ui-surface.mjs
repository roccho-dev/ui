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
}

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
  catalogId: surface[0].createSurface.catalogId,
}, null, 2));
