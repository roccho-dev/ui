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
const atlas = readAtlas(dataPath);

assertIncludes(html, atlas.summary.title, "rendered HTML must include title from data JSONL");
assertIncludes(html, atlas.summary.statusText, "rendered HTML must include status text from data JSONL");
assertIncludes(html, escapeHtml(atlas.containers[0].label), "rendered HTML must include container label from fixture");
assertIncludes(html, escapeHtml(atlas.elements[0].label), "rendered HTML must include element label from fixture");
assertIncludes(html, escapeHtml(atlas.edgeList[0]), "rendered HTML must include edge row from fixture");
assertIncludes(html, escapeHtml(atlas.diagnostics.at(-1)), "rendered HTML must include diagnostic from fixture");
assert.match(html, /data-render-source="jsonl-fixture"/);
assert.match(html, /generatedArtifactsAreAuthority" content="false/);
assert.match(html, /adapterOwnsState" content="false/);
assert.doesNotMatch(html, /updateDataModel/, "rendered HTML must not embed source JSONL messages");

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

function readAtlas(file) {
  const rows = parseJsonl(fs.readFileSync(file, "utf8"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].updateDataModel.path, "/atlas");
  return rows[0].updateDataModel.value;
}

function parseJsonl(text) {
  return String(text).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function assertIncludes(text, value, message) {
  assert.ok(text.includes(value), message || `expected text to include ${value}`);
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
