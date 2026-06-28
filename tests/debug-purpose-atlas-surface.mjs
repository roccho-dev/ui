import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const text = fs.readFileSync(path.join(root, "tests/fixtures/purpose-atlas/surface.v0.9.jsonl"), "utf8");
assert.ok(text.includes('"surfaceId":"purpose-atlas"'));
assert.ok(text.includes('"component":"A2uiSduiSurface"'));
assert.ok(text.includes('"document"'));
assert.ok(text.includes('"tree"'));
assert.ok(text.includes('"styles"'));
assert.ok(text.includes('"css"'));
assert.equal(text.includes('"updateDataModel"'), false);
console.log("debug-purpose-atlas-surface-pass");
