import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const oldFixtureRoot = path.join(root, "tests/fixtures/purpose-atlas-v6-a2ui");
assert.equal(fs.existsSync(oldFixtureRoot), false, "legacy Purpose Atlas fixture app path must be absent");

const packageGeneratedFiles = [
  "packages/purpose-atlas-preview/public/a2ui/purpose-atlas.surface.jsonl",
  "packages/purpose-atlas-preview/src/data/atlas-data.json",
];
for (const file of packageGeneratedFiles) {
  assert.equal(fs.existsSync(path.join(root, file)), false, `${file} must be generated from tests/fixtures/purpose-atlas, not tracked`);
}

const sourceRefRoot = path.join(root, "tests/reference/purpose-atlas-source");
function collectFiles(dir, prefix = "") {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const child = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(child, relative) : [relative];
  });
}
assert.deepEqual(collectFiles(sourceRefRoot).filter((file) => file.endsWith(".py")), [], "source reference sentinel must not track Python files");

const catalogText = fs.readFileSync(path.join(root, "packages/core-port/src/catalog.mjs"), "utf8");
assert.ok(catalogText.includes("tests/fixtures/purpose-atlas/surface.v0.9.jsonl"), "catalog must point to the fixture A2UI shell");
assert.ok(!catalogText.includes("tests/fixtures/purpose-atlas-v6-a2ui"), "catalog must not point to the legacy fixture app path");

console.log(JSON.stringify({ status: "purpose-atlas-final-layout-pass" }, null, 2));
