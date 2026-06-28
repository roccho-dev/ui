import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { purposeAtlasHtmlBox } from "#core-port";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function collectFiles(dir, prefix = "") {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(full, relative) : [relative];
  });
}
assert.deepEqual(purposeAtlasHtmlBox.assets, ["index.html"]);
const referenceRoot = path.join(root, "tests/reference/purpose-atlas-source");
assert.deepEqual(collectFiles(referenceRoot).filter((file) => file.endsWith(".py")), []);
const oldFixtureRoot = path.join(root, "tests/fixtures/purpose-atlas-v6-a2ui");
assert.deepEqual(collectFiles(oldFixtureRoot).filter((file) => file.toLowerCase().endsWith(".png")), []);
console.log("debug-purpose-atlas-tail-pass");
