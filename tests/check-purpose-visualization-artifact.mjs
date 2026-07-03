import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const missing = spawnSync(process.execPath, ["scripts/build-purpose-visualization-artifact.mjs", fs.mkdtempSync(path.join(os.tmpdir(), "ui-purpose-visualization-missing-"))], {
  cwd: root,
  encoding: "utf8",
});
assert.notEqual(missing.status, 0, "builder must fail without explicit declared JSONL inputs");
assert.match(`${missing.stderr}\n${missing.stdout}`, /explicit closure JSONL input path is required/);

const externalInputs = fs.mkdtempSync(path.join(os.tmpdir(), "ui-purpose-visualization-inputs-"));
const closureInput = path.join(externalInputs, "closure.external.jsonl");
const surfaceInput = path.join(externalInputs, "surface.external.jsonl");
fs.copyFileSync(path.join(root, "tests/fixtures/purpose-closure/one-loop.valid.jsonl"), closureInput);
fs.copyFileSync(path.join(root, "tests/fixtures/purpose-atlas/surface.v0.9.jsonl"), surfaceInput);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ui-purpose-visualization-"));
execFileSync(process.execPath, [
  "scripts/build-purpose-visualization-artifact.mjs",
  "--out", tmp,
  "--closure-jsonl", closureInput,
  "--surface-jsonl", surfaceInput,
  "--input-provider", "nix-declared",
  "--injected-by", "cli",
], { cwd: root, stdio: "inherit" });
const htmlPath = path.join(tmp, "purpose-visualization-html", "index.html");
const manifestPath = path.join(tmp, "purpose-visualization-evidence", "manifest.json");
const closureBundle = path.join(tmp, "purpose-visualization-html", "source", "purpose-closure.valid.jsonl");
const surfaceBundle = path.join(tmp, "purpose-visualization-html", "source", "purpose-atlas.surface.jsonl");
assert.equal(fs.existsSync(htmlPath), true);
assert.equal(fs.existsSync(surfaceBundle), true);
assert.equal(fs.existsSync(closureBundle), true);
const html = fs.readFileSync(htmlPath, "utf8");
for (const token of ["Purpose Decision Atlas v6", "Purpose visualization", "Purpose closure object", "Selected gap", "Work order", "Receipt", "receipt states are separated", "Residual next input", "returned residuals", "高価値法人構築と売却", "runtime executed", "core-port-path"]) assert.ok(html.includes(token), `missing token ${token}`);
assert.equal(html.includes("purpose-atlas-preview"), false);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert.equal(manifest.status, "purpose-visualization-artifact-ready");
assert.equal(manifest.generatedArtifactsAreAuthority, false);
assert.equal(manifest.outputPaths.html, "purpose-visualization-html/index.html");
assert.equal(manifest.outputPaths.screenshots, "purpose-visualization-screenshots/*.png");
assert.equal(manifest.inputContract.kind, "ui.purposeVisualizationInputContract.v1");
assert.equal(manifest.inputContract.provider, "nix-declared");
assert.equal(manifest.inputContract.injectedBy, "cli");
assert.equal(manifest.inputContract.inputs.closure.path, closureInput);
assert.equal(manifest.inputContract.inputs.surface.path, surfaceInput);
assert.equal(manifest.adapter.ownsState, false);
assert.equal(manifest.adapter.corePortPath, "#core-port/purposeVisualizationArtifactAdapter");
assert.equal(manifest.source.closure.path, closureInput);
assert.equal(manifest.source.surface.path, surfaceInput);
assert.equal(manifest.source.closure.sha256, sha256(fs.readFileSync(closureInput, "utf8")));
assert.equal(manifest.source.surface.sha256, sha256(fs.readFileSync(surfaceInput, "utf8")));
assert.equal(sha256(fs.readFileSync(closureBundle, "utf8")), manifest.source.closure.sha256);
assert.equal(sha256(fs.readFileSync(surfaceBundle, "utf8")), manifest.source.surface.sha256);
assert.equal(manifest.bundledSourceParity, true);
console.log(JSON.stringify({ status: "purpose-visualization-artifact-check-pass", inputContract: manifest.inputContract, adapter: manifest.adapter }, null, 2));

function sha256(text) { return crypto.createHash("sha256").update(text).digest("hex"); }
