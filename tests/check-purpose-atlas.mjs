import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defaultRegistry, purposeAtlasHtmlBox } from "#core-port";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const oldFixtureRoot = path.join(root, "tests/fixtures/purpose-atlas-v6-a2ui");
const fixtureRoot = path.join(root, "tests/fixtures/purpose-atlas");
const referenceRoot = path.join(root, "tests/reference/purpose-atlas-source");
const previewRoot = path.join(root, "packages/purpose-atlas-preview");
const docsRoot = path.join(root, "docs/purpose-atlas-v6-a2ui");
const surfacePath = path.join(fixtureRoot, "surface.v0.9.jsonl");
const atlasDataPath = path.join(fixtureRoot, "atlas-data.json");
const sourceLockPath = path.join(referenceRoot, "SOURCE_LOCK.json");
const sourceRoot = path.join(referenceRoot, "source");

const forbiddenAuthorityFields = ["approval", "approvalStatus", "canonicalState", "mergeReady", "authorizesFire", "authorizesMerge", "ownerDecisionAccepted", "decisionAccepted"];

function walkNoAuthority(label, value, trail = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach((item, index) => walkNoAuthority(label, item, [...trail, index]));
  for (const key of Object.keys(value)) {
    assert.ok(!forbiddenAuthorityFields.includes(key), `${label} must not assert authority field ${[...trail, key].join(".")}`);
    walkNoAuthority(label, value[key], [...trail, key]);
  }
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function collectFiles(dir, prefix = "") {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(full, relative) : [relative];
  });
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.match(html, /Purpose Decision Atlas v6/);
assert.match(html, /purpose-atlas-app/);

const dataContract = fs.readFileSync(path.join(docsRoot, "A2UI-DATA-CONTRACT.md"), "utf8");
for (const phrase of ["ADRS projected input", "core+port as lib", "jsonl as attached data", "non-authoritative", "ui.git is not a state store"]) {
  assert.ok(dataContract.includes(phrase), `Purpose Atlas data contract must contain ${phrase}`);
}

for (const file of ["package.json", "package-lock.json", "vite.config.js", "index.html", "scripts/build_standalone.py", "scripts/sync-fixtures.mjs", "src/main.js", "src/app.js", "src/runtime/atlas-runtime.js", "src/a2ui/apis.js", "src/a2ui/catalog.js", "src/a2ui/validate-messages.js", "src/components/atlas-source-surface.js", "src/ui/cached-atlas-renderer.js", "src/domain/atlas-engine.js", "src/styles/global.css", "src/styles/source-ui.css"]) {
  assert.equal(fs.existsSync(path.join(previewRoot, file)), true, `preview package must own ${file}`);
}
for (const generated of ["public/a2ui/purpose-atlas.surface.jsonl", "src/data/atlas-data.json"]) {
  assert.equal(fs.existsSync(path.join(previewRoot, generated)), false, `preview package must generate ${generated} from fixture`);
}
for (const file of ["package.json", "package-lock.json", "vite.config.js", "index.html", "public", "scripts", "src", "test"]) {
  assert.equal(fs.existsSync(path.join(oldFixtureRoot, file)), false, `fixture must not retain preview app path ${file}`);
}

const surfaceText = fs.readFileSync(surfacePath, "utf8");
const surfaceLines = surfaceText.trim().split(/\n+/).map((line) => JSON.parse(line));
assert.equal(surfaceLines[0].version, "v0.9");
assert.equal(surfaceLines[0].createSurface.surfaceId, "purpose-atlas");
assert.ok(surfaceLines.some((line) => line.updateComponents), "surface fixture must contain components");
assert.ok(!surfaceLines.some((line) => line.updateDataModel), "surface fixture must not contain generated data state");
assert.doesNotMatch(surfaceText, /functionCall|<script|innerHTML|eval\(/);
walkNoAuthority("Purpose Atlas A2UI surface JSONL", surfaceLines);

const atlasData = JSON.parse(fs.readFileSync(atlasDataPath, "utf8"));
walkNoAuthority("Purpose Atlas fixture data", atlasData);

const sourceLock = JSON.parse(fs.readFileSync(sourceLockPath, "utf8"));
for (const [file, expected] of Object.entries(sourceLock.sourceFilesSha256)) {
  assert.equal(sha256File(path.join(sourceRoot, file)), expected, `source reference digest must match lock for ${file}`);
}
assert.deepEqual(collectFiles(referenceRoot).filter((file) => file.endsWith(".py")), [], "source reference sentinel must not add Python files");

const registry = defaultRegistry();
const atlasEntry = registry.get("AtlasSourceSurface");
assert.equal(atlasEntry.family, "purpose_atlas");
assert.equal(atlasEntry.childrenPolicy, "none");
assert.ok(atlasEntry.actions.includes("atlas.recordMismatch"));
assert.equal(purposeAtlasHtmlBox.accepts, "a2ui.surface.v0.9");
assert.deepEqual(purposeAtlasHtmlBox.assets, ["index.html"]);

for (const generated of ["dist", "evidence", "MANIFEST.sha256"]) {
  assert.equal(fs.existsSync(path.join(oldFixtureRoot, generated)), false, `generated ${generated} must not be tracked as fixture authority`);
}
assert.deepEqual(collectFiles(oldFixtureRoot).filter((file) => file.toLowerCase().endsWith(".png")), [], "Purpose Atlas preview evidence must not depend on PNG artifacts");

console.log(JSON.stringify({ status: "purpose-atlas-a2ui-check-pass", surface: "purpose-atlas" }, null, 2));
