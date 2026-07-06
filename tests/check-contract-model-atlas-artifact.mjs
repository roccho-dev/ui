import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildContractModelAtlasArtifact } from "../scripts/build-contract-model-atlas-artifact.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "contract-model-atlas-artifact-"));
const built = buildContractModelAtlasArtifact({ outDir: tmp });

const htmlPath = path.join(tmp, "preview", "index.html");
const receiptPath = path.join(tmp, "proof", "contract-model-atlas-receipt.json");
const shellPath = path.join(tmp, "source", "shell.v0.9.jsonl");
const dataPath = path.join(tmp, "source", "data.contract-model-atlas.v1.jsonl");
const registryPath = path.join(tmp, "source", "registry.json");

for (const file of [htmlPath, receiptPath, shellPath, dataPath, registryPath, path.join(tmp, "MANIFEST.sha256")]) {
  assert.ok(fs.existsSync(file), `${file} must exist`);
  assert.ok(fs.statSync(file).size > 0, `${file} must be non-empty`);
}

const html = fs.readFileSync(htmlPath, "utf8");
const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));

assert.match(html, /Contract Model Atlas A2UI Preview/);
assert.match(html, /\.\.\/source\/registry\.json/);
assert.match(html, /\.\.\/source\/shell\.v0\.9\.jsonl/);
assert.match(html, /\.\.\/source\/data\.contract-model-atlas\.v1\.jsonl/);
assert.match(html, /generatedArtifactsAreAuthority" content="false/);
assert.doesNotMatch(html, /schemas=2 fields=4 queries=2 fixtures=2 deprecated=1/, "display data must stay in external JSONL, not HTML");
assert.doesNotMatch(html, /ledger JSONL/, "atlas node data must stay in external JSONL, not HTML");

assert.equal(receipt.kind, "ui.contractModelAtlas.artifactReceipt.v1");
assert.equal(receipt.status, "PASS");
assert.equal(receipt.surfaceId, built.contract.surfaceId);
assert.equal(receipt.adapterOwnsState, false);
assert.equal(receipt.generatedArtifactsAreAuthority, false);
assert.equal(receipt.authority, false);
for (const field of ["shellDigest", "dataDigest", "htmlDigest", "viewDigest", "receiptDigest"]) {
  assert.match(receipt[field], /^[a-f0-9]{64}$/);
}
assert.ok(receipt.files.includes("preview/index.html"));
assert.ok(receipt.files.includes("source/data.contract-model-atlas.v1.jsonl"));
assert.ok(receipt.files.includes("proof/compiled-shell.json"));

console.log(JSON.stringify({
  status: "contract-model-atlas-artifact-check-pass",
  html: "preview/index.html",
  receipt: "proof/contract-model-atlas-receipt.json",
  fileCount: built.files.length,
  generatedArtifactsAreAuthority: false,
}, null, 2));
