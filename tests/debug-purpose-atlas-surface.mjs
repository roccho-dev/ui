import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const text = fs.readFileSync(path.join(root, "tests/fixtures/purpose-atlas/surface.v0.9.jsonl"), "utf8");
const rows = text.trim().split(/\n+/).map((line) => JSON.parse(line));
const update = rows.find((row) => row.updateComponents);
const component = update.updateComponents.components[0];
assert.equal(rows[0].createSurface.surfaceId, "purpose-atlas");
assert.equal(component.component, "A2uiSduiSurface");
assert.ok(component.document.tree);
assert.ok(component.document.styles.css);
assert.equal(rows.filter((row) => row.updateDataModel).length, 0);
console.log("debug-purpose-atlas-surface-pass");
