import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referenceRoot = path.join(root, "tests/reference/purpose-atlas-source");
const sourceRoot = path.join(referenceRoot, "source");
const sourceLock = JSON.parse(fs.readFileSync(path.join(referenceRoot, "SOURCE_LOCK.json"), "utf8"));
function sha256File(filePath) { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }
for (const [file, expected] of Object.entries(sourceLock.sourceFilesSha256)) {
  assert.equal(sha256File(path.join(sourceRoot, file)), expected, `source reference digest mismatch for ${file}`);
}
console.log("debug-purpose-atlas-reference-pass");
