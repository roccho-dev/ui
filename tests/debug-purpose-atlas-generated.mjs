import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const file of ["packages/purpose-atlas-preview/public/a2ui/purpose-atlas.surface.jsonl", "packages/purpose-atlas-preview/src/data/atlas-data.json"]) {
  assert.equal(fs.existsSync(path.join(root, file)), false, `${file} must be generated only`);
}
const oldFixtureRoot = path.join(root, "tests/fixtures/purpose-atlas-v6-a2ui");
for (const file of ["package.json", "package-lock.json", "vite.config.js", "index.html", "public", "scripts", "src", "test", "dist", "evidence", "MANIFEST.sha256"]) {
  assert.equal(fs.existsSync(path.join(oldFixtureRoot, file)), false, `legacy fixture must not retain ${file}`);
}
console.log("debug-purpose-atlas-generated-pass");
