import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "tests/fixtures/purpose-atlas");
const goldenRoot = path.join(root, "tests/golden/purpose-atlas");
const referenceRoot = path.join(root, "tests/reference/purpose-atlas-source");
const surfacePath = path.join(fixtureRoot, "surface.v0.9.jsonl");
const atlasDataPath = path.join(fixtureRoot, "atlas-data.json");
const sourceLockPath = path.join(referenceRoot, "SOURCE_LOCK.json");
const sourceRoot = path.join(referenceRoot, "source");

const forbiddenFixtureNames = new Set([
  "dist",
  "evidence",
  "MANIFEST.sha256",
  "package.json",
  "package-lock.json",
  "vite.config.js",
  "index.html",
  "src",
  "scripts",
  "test",
]);

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

function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

assert.ok(fs.existsSync(surfacePath), "Purpose Atlas A2UI surface fixture must live under tests/fixtures/purpose-atlas");
const surfaceRows = readJsonl(surfacePath);
assert.equal(surfaceRows[0]?.version, "v0.9");
assert.equal(surfaceRows[0]?.createSurface?.surfaceId, "purpose-atlas");
assert.ok(surfaceRows.some((row) => row.updateComponents), "surface fixture must contain component bindings");
assert.ok(!surfaceRows.some((row) => row.updateDataModel), "surface fixture must be shell/input only, not generated state output");

assert.ok(fs.existsSync(atlasDataPath), "Purpose Atlas data fixture must live under tests/fixtures/purpose-atlas");
const atlasData = JSON.parse(fs.readFileSync(atlasDataPath, "utf8"));
assert.ok(Array.isArray(atlasData.base_nodes), "atlas-data fixture must contain base_nodes input");
assert.ok(Array.isArray(atlasData.base_edges), "atlas-data fixture must contain base_edges input");
assert.ok(Array.isArray(atlasData.events), "atlas-data fixture must contain events input");

const fixtureNames = collectNames(fixtureRoot);
for (const name of fixtureNames) {
  assert.ok(!forbiddenFixtureNames.has(name), `tests/fixtures/purpose-atlas must not contain app/build artifact: ${name}`);
}

assert.ok(fs.existsSync(sourceLockPath), "Purpose Atlas source lock must live under tests/reference/purpose-atlas-source");
const sourceLock = JSON.parse(fs.readFileSync(sourceLockPath, "utf8"));
assert.equal(sourceLock.sourceForm, "uncompressed files copied from latest source tree");
assert.ok(sourceLock.sourceFilesSha256?.["ui-shell.html"], "source reference lock must keep source file digests");
assert.ok(sourceLock.semanticWitness, "source reference lock must keep semantic witness metadata");
assert.ok(sourceLock.htmlWitness, "source reference lock must keep HTML witness metadata");
for (const [file, expected] of Object.entries(sourceLock.sourceFilesSha256)) {
  const actualPath = path.join(sourceRoot, file);
  assert.ok(fs.existsSync(actualPath), `source reference file must exist: ${file}`);
  assert.equal(sha256(actualPath), expected, `source reference digest must match for ${file}`);
}

for (const file of collectFiles(goldenRoot)) {
  assert.ok(!file.includes("source/"), `golden must not contain old source reference files: ${file}`);
  assert.ok(!forbiddenFixtureNames.has(path.basename(file)), `golden must not contain app/build artifact: ${file}`);
}

console.log(JSON.stringify({
  status: "purpose-atlas-fixture-boundaries-pass",
  fixtureRoot: "tests/fixtures/purpose-atlas",
  referenceRoot: "tests/reference/purpose-atlas-source",
  surfaceRows: surfaceRows.length,
  referenceFiles: Object.keys(sourceLock.sourceFilesSha256).length,
}, null, 2));
