import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defaultRegistry } from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = path.join(root, "packages/purpose-atlas-source-ui-golden");

function read(rel) {
  return fs.readFileSync(path.join(pkg, rel), "utf8");
}

function readJson(rel) {
  return JSON.parse(read(rel));
}

function readJsonl(rel) {
  return read(rel)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

assert.ok(fs.existsSync(pkg), "purpose atlas source-UI package must be imported");
assert.ok(!fs.existsSync(path.join(pkg, "dist")), "dist must remain generated output, not proposal source truth");
assert.ok(!read("package-lock.json").includes("packages.applied-caas-gateway1.internal.api.openai.org"), "lockfile must not pin internal registry URLs");

const registry = defaultRegistry();
const atlas = registry.get("AtlasSourceSurface");
assert.ok(atlas, "AtlasSourceSurface must be registered");
assert.equal(atlas.family, "purpose_atlas");
assert.equal(atlas.childrenPolicy, "none");
assert.deepEqual(atlas.allowedSurfaceIds, ["purpose-atlas"]);
assert.equal(atlas.actions.length, 15);
assert.ok(atlas.state.includes("/atlas"));

const surface = readJsonl("public/a2ui/purpose-atlas.surface.jsonl");
assert.equal(surface.length, 3, "source-UI surface must be native A2UI v0.9 create/update/updateDataModel");
assert.ok(surface.some((record) => record.createSurface?.surfaceId === "purpose-atlas"));
const componentRecord = surface.find((record) => record.updateComponents);
assert.ok(componentRecord, "surface must declare components");
assert.equal(componentRecord.updateComponents.components.length, 1);
assert.equal(componentRecord.updateComponents.components[0].component, "AtlasSourceSurface");

const verification = readJson("evidence/verification-summary.json");
assert.equal(verification.status, "pass");
assert.equal(verification.a2ui.protocol, "v0.9");
assert.equal(verification.a2ui.components, 1);
assert.equal(verification.a2ui.actions, 15);
assert.equal(verification.semanticWitness.stepsExact, 41);
assert.equal(verification.semanticWitness.mismatches, 0);
assert.equal(verification.visualWitness.desktop.pass, true);
assert.equal(verification.visualWitness.mobile.pass, true);

const golden = readJson("golden/GOLDEN_LOCK.json");
assert.ok(golden, "golden lock must be present");
const witness = read("evidence/golden-witness.md");
assert.ok(witness.includes("Status: **PASS**"));

const proposal = fs.readFileSync(path.join(root, "docs/proposals/purpose-atlas-source-ui-golden-witness-260618.md"), "utf8");
assert.ok(proposal.includes("a2ui.context.surface.v1"), "proposal must name the resolved context adapter requirement");
assert.ok(proposal.includes("not become the semantic authority"), "proposal must preserve the authority boundary");
assert.ok(proposal.includes("incorporate-with-quarantine"), "proposal must record Gen1-A result");

console.log(JSON.stringify({
  status: "purpose-atlas-source-ui-golden-check-pass",
  components: surface[1].updateComponents.components.length,
  actions: atlas.actions.length,
  semanticSteps: verification.semanticWitness.stepsExact,
}, null, 2));
