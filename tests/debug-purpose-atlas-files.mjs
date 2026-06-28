import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewRoot = path.join(root, "packages/purpose-atlas-preview");
for (const file of ["src/components/a2ui-sdui-surface.js", "src/components/atlas-source-surface.js", "src/a2ui/apis.js", "src/a2ui/catalog.js", "src/styles/global.css"]) {
  assert.equal(fs.existsSync(path.join(previewRoot, file)), true, `missing ${file}`);
}
assert.equal(fs.existsSync(path.join(previewRoot, "src/styles/source-ui.css")), false, "legacy source css must be absent");
console.log("debug-purpose-atlas-files-pass");
