import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildContractModelAtlasArtifact } from "../scripts/build-contract-model-atlas-artifact.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "tests", "fixtures", "contract-model-atlas");
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

assert.includes = (text, value, message) => assert.ok(text.includes(value), message || `expected HTML to include ${value}`);
assert.includes(html, atlas.summary.title, "rendered HTML must include title from data JSONL");
assert.includes(html, atlas.summary.statusText, "rendered HTML must include status text from data JSONL");
for (const row of [...atlas.containers, ...atlas.elements]) assert.includes(html, escapeHtml(row.label), `rendered HTML must include label from fixture: ${row.id}`);
for (const row of atlas.edgeList) assert.includes(html, escapeHtml(row), "rendered HTML must include edge list rows from fixture");
for (const row of atlas.diagnostics) assert.includes(html, escapeHtml(row), "rendered HTML must include diagnostics from fixture");

assert.match(html, /data-render-source="jsonl-fixture"/);
assert.match(html, /generatedArtifactsAreAuthority" content="false/);
assert.match(html, /adapterOwnsState" content="false/);
assert.doesNotMatch(html, /updateDataModel/, "rendered HTML must not embed source JSONL messages");
assert.doesNotMatch(html, /\"containers\"/, "rendered HTML must not embed raw atlas JSON");
assert.doesNotMatch(html, /\"elements\"/, "rendered HTML must not embed raw atlas JSON");

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

const mutatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "contract-model-atlas-fixture-"));
copyDir(fixtureRoot, mutatedRoot);
const rows = parseJsonl(fs.readFileSync(path.join(mutatedRoot, "data.contract-model-atlas.v1.jsonl"), "utf8"));
const mutatedAtlas = rows[0].updateDataModel.value;
const originalTitle = mutatedAtlas.summary.title;
const originalLabel = mutatedAtlas.elements[0].label;
mutatedAtlas.summary.title = `${originalTitle} / fixture mutation`;
mutatedAtlas.elements[0].label = `${originalLabel} / fixture mutation`;
fs.writeFileSync(path.join(mutatedRoot, "data.contract-model-atlas.v1.jsonl"), rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
const mutatedOut = fs.mkdtempSync(path.join(os.tmpdir(), "contract-model-atlas-artifact-mutated-"));
const mutatedBuilt = buildContractModelAtlasArtifact({ outDir: mutatedOut, fixtureRoot: mutatedRoot });
const mutatedHtml = fs.readFileSync(path.join(mutatedOut, "preview", "index.html"), "utf8");
const mutatedReceipt = JSON.parse(fs.readFileSync(path.join(mutatedOut, "proof", "contract-model-atlas-receipt.json"), "utf8"));
assert.includes(mutatedHtml, escapeHtml(mutatedAtlas.summary.title), "mutated fixture title must appear in rendered HTML");
assert.includes(mutatedHtml, escapeHtml(mutatedAtlas.elements[0].label), "mutated fixture label must appear in rendered HTML");
assert.notEqual(mutatedHtml, html, "fixture data change must change rendered HTML");
assert.equal(mutatedReceipt.shellDigest, receipt.shellDigest, "data-only fixture change must not change shell digest");
assert.notEqual(mutatedReceipt.htmlDigest, receipt.htmlDigest, "data-only fixture change must change HTML digest");
assert.equal(mutatedBuilt.contract.generatedArtifactsAreAuthority, false);

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

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
