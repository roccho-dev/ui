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
const previewRoot = path.join(root, "packages/purpose-atlas-preview");
const surfacePath = path.join(fixtureRoot, "surface.v0.9.jsonl");
const dataPath = path.join(fixtureRoot, "atlas-data.json");
const forbiddenAuthorityFields = new Set(["approval", "approvalStatus", "canonicalState", "mergeReady", "authorizesFire", "authorizesMerge", "ownerDecisionAccepted", "decisionAccepted"]);

function collectFiles(dir, prefix = "") {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(full, relative) : [relative];
  });
}
function sha256File(filePath) { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
function walkNoAuthority(value, trail = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach((item, index) => walkNoAuthority(item, [...trail, index]));
  for (const key of Object.keys(value)) {
    assert.equal(forbiddenAuthorityFields.has(key), false, `forbidden authority field ${[...trail, key].join(".")}`);
    walkNoAuthority(value[key], [...trail, key]);
  }
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.match(html, /Purpose Decision Atlas v6/);
assert.match(html, /purpose-atlas-app/);

const dataContract = fs.readFileSync(path.join(root, "docs/purpose-atlas-v6-a2ui/A2UI-DATA-CONTRACT.md"), "utf8");
for (const phrase of ["ADRS projected input", "core+port as lib", "jsonl as attached data", "non-authoritative", "ui.git is not a state store"]) {
  assert.ok(dataContract.includes(phrase), `Purpose Atlas data contract must contain ${phrase}`);
}

for (const file of ["package.json", "package-lock.json", "vite.config.js", "index.html", "scripts/build_standalone.py", "scripts/sync-fixtures.mjs", "src/main.js", "src/app.js", "src/runtime/atlas-runtime.js", "src/a2ui/apis.js", "src/a2ui/catalog.js", "src/a2ui/validate-messages.js", "src/components/a2ui-sdui-surface.js", "src/components/atlas-source-surface.js", "src/ui/cached-atlas-renderer.js", "src/domain/atlas-engine.js", "src/styles/global.css"]) {
  assert.equal(fs.existsSync(path.join(previewRoot, file)), true, `preview package must own ${file}`);
}
for (const file of ["src/styles/source-ui.css", "public/a2ui/purpose-atlas.surface.jsonl", "src/data/atlas-data.json"]) {
  assert.equal(fs.existsSync(path.join(previewRoot, file)), false, `${file} must not be tracked in preview package`);
}

const surfaceText = fs.readFileSync(surfacePath, "utf8");
for (const token of ['"surfaceId":"purpose-atlas"', '"component":"A2uiSduiSurface"', '"document"', '"tree"', '"styles"', '"css"', '"port":"atlasStage"']) {
  assert.ok(surfaceText.includes(token), `surface JSONL must contain ${token}`);
}
assert.equal(surfaceText.includes('"updateDataModel"'), false, "surface fixture must not contain generated state");

const atlasData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
assert.ok(Array.isArray(atlasData.base_nodes));
assert.ok(Array.isArray(atlasData.base_edges));
assert.ok(Array.isArray(atlasData.events));
walkNoAuthority(atlasData);

const oldAdapter = fs.readFileSync(path.join(previewRoot, "src/components/atlas-source-surface.js"), "utf8");
const sduiRenderer = fs.readFileSync(path.join(previewRoot, "src/components/a2ui-sdui-surface.js"), "utf8");
for (const token of ["topbar", "purpose-card", "workspace", "timeline", "source-ui.css"]) {
  assert.equal(oldAdapter.includes(token), false, `compat adapter must not keep layout token ${token}`);
}
for (const token of ['class="topbar"', 'class="purpose-card"', 'class="workspace"', 'class="timeline"', "source-ui.css"]) {
  assert.equal(sduiRenderer.includes(token), false, `SDUI renderer must not hard-code old layout token ${token}`);
}
assert.ok(sduiRenderer.includes('data-sdui-port="atlasStage"'));
assert.ok(sduiRenderer.includes("cleanCss"));

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
assert.deepEqual(purposeAtlasHtmlBox.assets, ["index.html"]);

console.log(JSON.stringify({ status: "purpose-atlas-a2ui-check-pass", rootComponent: "A2uiSduiSurface" }, null, 2));
