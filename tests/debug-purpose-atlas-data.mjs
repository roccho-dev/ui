import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbidden = new Set(["approval", "approvalStatus", "canonicalState", "mergeReady", "authorizesFire", "authorizesMerge", "ownerDecisionAccepted", "decisionAccepted"]);
function walk(value, trail = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach((item, index) => walk(item, [...trail, index]));
  for (const key of Object.keys(value)) {
    assert.equal(forbidden.has(key), false, `forbidden key ${[...trail, key].join(".")}`);
    walk(value[key], [...trail, key]);
  }
}
walk(JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/purpose-atlas/atlas-data.json"), "utf8")));
console.log("debug-purpose-atlas-data-pass");
