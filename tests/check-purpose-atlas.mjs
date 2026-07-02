import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defaultRegistry, purposeAtlasHtmlBox } from "#core-port";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "tests/fixtures/purpose-atlas");
const oldFixtureRoot = path.join(root, "tests/fixtures/purpose-atlas-v6-a2ui");
const referenceRoot = path.join(root, "tests/reference/purpose-atlas-source");
const sourceRoot = path.join(referenceRoot, "source");
const surfacePath = path.join(fixtureRoot, "surface.v0.9.jsonl");
const dataPath = path.join(fixtureRoot, "atlas-data.json");

function collectFiles(dir, prefix = "") {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(full, relative) : [relative];
  });
}
function sha256File(filePath) { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function rows(text) { return text.trim().split(/\n+/).map((line) => JSON.parse(line)); }
function walkNoRetirementMarker(value, trail = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach((item, index) => walkNoRetirementMarker(item, [...trail, index]));
  for (const key of Object.keys(value)) {
    assert.notEqual(key, "retirement_state", `current atlas data must not keep retirement marker ${[...trail, key].join(".")}`);
    assert.notEqual(key, "false_positive_guard", `current atlas data must not keep guard marker ${[...trail, key].join(".")}`);
    walkNoRetirementMarker(value[key], [...trail, key]);
  }
}

const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.deepEqual(rootPackage.workspaces, ["packages/core-port"], "current npm workspace must expose the core port only");

const flakeText = fs.readFileSync(path.join(root, "flake.nix"), "utf8");
assert.equal(flakeText.includes("purpose-atlas-preview-html"), false, "retired Purpose Atlas runtime must not be a Nix package or check output");
assert.equal(flakeText.includes("mkPurposeAtlasPreview"), false, "retired Purpose Atlas runtime builder must not remain in flake");

const dataContract = fs.readFileSync(path.join(root, "docs/purpose-atlas-v6-a2ui/A2UI-DATA-CONTRACT.md"), "utf8");
for (const phrase of ["ADRS projected input", "core+port as lib", "jsonl as attached data", "non-authoritative", "ui.git is not a state store"]) {
  assert.ok(dataContract.includes(phrase), `Purpose Atlas data contract must contain ${phrase}`);
}

const surfaceText = fs.readFileSync(surfacePath, "utf8");
for (const token of ['"surfaceId":"purpose-atlas"', '"component":"A2uiSduiSurface"', '"document"', '"tree"', '"styles"', '"css"', '"port":"atlasStage"']) {
  assert.ok(surfaceText.includes(token), `surface JSONL must contain ${token}`);
}
assert.equal(surfaceText.includes('"updateDataModel"'), false, "surface fixture must not contain generated state");

const surfaceRows = rows(surfaceText);
const update = surfaceRows.find((row) => row.updateComponents)?.updateComponents;
const component = update?.components?.[0];
const tree = JSON.stringify(component?.document?.tree || {});
for (const token of ["Purpose closure object", "Selected gap", "Work order", "Receipt", "Residual next input"]) {
  assert.ok(tree.includes(token), `current surface must expose ${token}`);
}
for (const action of ["atlas.previous", "atlas.next", "atlas.stepChanged", "atlas.modeChanged", "atlas.fit", "atlas.select", "atlas.clearSelection"]) {
  assert.ok(surfaceText.includes(action), `current surface must keep review action ${action}`);
}

const atlasData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
assert.ok(Array.isArray(atlasData.base_nodes));
assert.ok(Array.isArray(atlasData.base_edges));
assert.ok(Array.isArray(atlasData.events));
walkNoRetirementMarker(atlasData);
const kindSet = new Set(atlasData.base_nodes.map((node) => node.kind));
for (const kind of ["purpose", "gap", "work_order", "receipt", "residual"]) {
  assert.ok(kindSet.has(kind), `atlas data must include ${kind}`);
}
assert.equal(JSON.stringify(atlasData).includes("future-retirement"), false, "current atlas data must not keep future retirement text");

const sourceLock = JSON.parse(fs.readFileSync(path.join(referenceRoot, "SOURCE_LOCK.json"), "utf8"));
for (const [file, expected] of Object.entries(sourceLock.sourceFilesSha256)) {
  assert.equal(sha256File(path.join(sourceRoot, file)), expected, `source reference digest mismatch for ${file}`);
}
assert.deepEqual(collectFiles(referenceRoot).filter((file) => file.endsWith(".py")), []);
assert.deepEqual(collectFiles(oldFixtureRoot).filter((file) => file.toLowerCase().endsWith(".png")), []);

const registry = defaultRegistry();
const sduiEntry = registry.get("A2uiSduiSurface");
assert.ok(sduiEntry);
assert.equal(sduiEntry.family, "purpose_atlas");
assert.ok(sduiEntry.props.includes("document"));
assert.ok(sduiEntry.actions.includes("atlas.recordMismatch"));
assert.equal(registry.get("AtlasSourceSurface")?.family, "purpose_atlas");
assert.equal(purposeAtlasHtmlBox.accepts, "a2ui.surface.v0.9");
assert.deepEqual(purposeAtlasHtmlBox.assets, ["tests/fixtures/purpose-atlas/surface.v0.9.jsonl"]);

console.log(JSON.stringify({ status: "purpose-atlas-current-projection-check-pass", rootComponent: "A2uiSduiSurface" }, null, 2));
