import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.match(html, /Purpose Decision Atlas v6/);
assert.match(html, /purpose-atlas-app/);
const text = fs.readFileSync(path.join(root, "docs/purpose-atlas-v6-a2ui/A2UI-DATA-CONTRACT.md"), "utf8");
for (const phrase of ["ADRS projected input", "core+port as lib", "jsonl as attached data", "non-authoritative", "ui.git is not a state store"]) {
  assert.ok(text.includes(phrase), `missing ${phrase}`);
}
console.log("debug-purpose-atlas-docs-pass");
