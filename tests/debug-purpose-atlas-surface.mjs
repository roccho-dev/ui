import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const surfaceText = fs.readFileSync(path.join(root, "tests/fixtures/purpose-atlas/surface.v0.9.jsonl"), "utf8");
const lines = surfaceText.trim().split(/\n+/).map((line) => JSON.parse(line));
const rootComponent = lines.find((line) => line.updateComponents)?.updateComponents?.components?.[0];
assert.equal(lines[0]?.createSurface?.surfaceId, "purpose-atlas");
assert.equal(rootComponent?.component, "A2uiSduiSurface");
assert.ok(rootComponent?.document?.tree);
assert.ok(rootComponent?.document?.styles?.css);
assert.ok(!lines.some((line) => line.updateDataModel));
assert.doesNotMatch(surfaceText, /functionCall|eval\(/i);
console.log("debug-purpose-atlas-surface-pass");
