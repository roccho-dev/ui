import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rows = fs.readFileSync(path.join(root, "ci.intent.v1.jsonl"), "utf8").trim().split(/\n+/).map((line) => JSON.parse(line));
const files = [];
for (const row of rows) {
  if (Array.isArray(row.entrypoints)) files.push(...row.entrypoints);
  if (row.path) files.push(row.path);
}
assert.ok(files.length >= 4);
for (const file of files) assert.equal(fs.existsSync(path.join(root, file)), true, file);
console.log("ui-ci-workflows-check-pass");
