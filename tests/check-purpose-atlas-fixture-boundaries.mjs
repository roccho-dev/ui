import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "tests/fixtures/purpose-atlas");
const referenceRoot = path.join(root, "tests/reference/purpose-atlas-source");
const previewRoot = path.join(root, "packages/purpose-atlas-preview");
const sourceRoot = path.join(referenceRoot, "source");
const forbiddenFixtureNames = new Set(["dist", "evidence", "MANIFEST.sha256", "package.json", "package-lock.json", "vite.config.js", "index.html", "src", "scripts", "test"]);

function collectNames(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(dir, entry.name);
    return entry.isDirectory() ? [entry.name, ...collectNames(child)] : [entry.name];
  });
}
function collectFiles(dir, prefix = "") {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const child = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(child, relative) : [relative];
  });
}
function sha256(filePath) { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }

const surfacePath = path.join(fixtureRoot, "surface.v0.9.jsonl");
assert.ok(fs.existsSync(surfacePath));
const surfaceText = fs.readFileSync(surfacePath, "utf8");
for (const token of ['"version":"v0.9"', '"surfaceId":"purpose-atlas"', '"component":"A2uiSduiSurface"', '"document"', '"tree"', '"css"']) {
  assert.ok(surfaceText.includes(token), `surface fixture must contain ${token}`);
}
assert.equal(surfaceText.includes('"updateDataModel"'), false, "surface fixture must be shell/input only");

const atlasData = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "atlas-data.json"), "utf8"));
assert.ok(Array.isArray(atlasData.base_nodes));
assert.ok(Array.isArray(atlasData.base_edges));
assert.ok(Array.isArray(atlasData.events));
for (const name of collectNames(fixtureRoot)) {
  assert.equal(forbiddenFixtureNames.has(name), false, `tests/fixtures/purpose-atlas must not contain app/build artifact: ${name}`);
}
for (const generated of ["public/a2ui/purpose-atlas.surface.jsonl", "src/data/atlas-data.json"]) {
  assert.equal(fs.existsSync(path.join(previewRoot, generated)), false, `${generated} must be generated from fixture`);
}

const sourceLock = JSON.parse(fs.readFileSync(path.join(referenceRoot, "SOURCE_LOCK.json"), "utf8"));
assert.ok(sourceLock.sourceFilesSha256?.["ui-shell.html"]);
assert.ok(sourceLock.semanticWitness);
assert.ok(sourceLock.htmlWitness);
for (const [file, expected] of Object.entries(sourceLock.sourceFilesSha256)) {
  assert.equal(sha256(path.join(sourceRoot, file)), expected, `source reference digest mismatch for ${file}`);
}
assert.deepEqual(collectFiles(referenceRoot).filter((file) => file.endsWith(".py")), []);
console.log(JSON.stringify({ status: "purpose-atlas-fixture-boundaries-pass", fixtureRoot: "tests/fixtures/purpose-atlas" }, null, 2));
