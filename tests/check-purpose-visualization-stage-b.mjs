import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { purposeVisualizationArtifactAdapter, buildPurposeVisualizationArtifact } from "#core-port";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
assert.equal(purposeVisualizationArtifactAdapter.ownsState, false, "adapter descriptor must be stateless");
assert.equal(purposeVisualizationArtifactAdapter.accepts, "a2ui.surface.v0.9");
assert.equal(purposeVisualizationArtifactAdapter.corePortPath, "#core-port/purposeVisualizationArtifactAdapter");

const builderSource = fs.readFileSync(path.join(root, "scripts/build-purpose-visualization-artifact.mjs"), "utf8");
assert.match(builderSource, /from "#core-port"/);
assert.doesNotMatch(builderSource, /<!doctype|<html|Purpose Decision Atlas v6<\/title>/, "builder script must not contain direct HTML template");
assert.match(builderSource, /PURPOSE_VISUALIZATION_BYPASS_CORE_PORT/);

const bypass = spawnSync(process.execPath, ["scripts/build-purpose-visualization-artifact.mjs"], {
  cwd: root,
  env: { ...process.env, PURPOSE_VISUALIZATION_BYPASS_CORE_PORT: "1" },
  encoding: "utf8",
});
assert.notEqual(bypass.status, 0, "bypass mode must fail");
assert.match(`${bypass.stderr}\n${bypass.stdout}`, /bypass guard/);

const closurePath = "tests/fixtures/purpose-closure/one-loop.valid.jsonl";
const surfacePath = "tests/fixtures/purpose-atlas/surface.v0.9.jsonl";
const closureJsonl = fs.readFileSync(path.join(root, closurePath), "utf8");
const surfaceJsonl = fs.readFileSync(path.join(root, surfacePath), "utf8");
const built = buildPurposeVisualizationArtifact({ closureJsonl, surfaceJsonl, closurePath, surfacePath });
assert.equal(built.adapter.ownsState, false);
assert.equal(built.evidence.adapter.corePortPath, "#core-port/purposeVisualizationArtifactAdapter");
assert.equal(built.evidence.sourceDigests.closure.path, closurePath);
assert.equal(built.evidence.sourceDigests.surface.path, surfacePath);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ui-purpose-stage-b-"));
execFileSync(process.execPath, ["scripts/build-purpose-visualization-artifact.mjs", tmp], { cwd: root, stdio: "inherit" });
const manifest = JSON.parse(fs.readFileSync(path.join(tmp, "purpose-visualization-evidence", "manifest.json"), "utf8"));
assert.equal(manifest.adapter.ownsState, false);
assert.equal(manifest.adapter.corePortPath, "#core-port/purposeVisualizationArtifactAdapter");
assert.equal(manifest.source.closure.sha256, built.evidence.sourceDigests.closure.sha256);
assert.equal(manifest.source.surface.sha256, built.evidence.sourceDigests.surface.sha256);
const bundledClosure = fs.readFileSync(path.join(tmp, "purpose-visualization-html", "source", "purpose-closure.valid.jsonl"), "utf8");
const bundledSurface = fs.readFileSync(path.join(tmp, "purpose-visualization-html", "source", "purpose-atlas.surface.jsonl"), "utf8");
assert.equal(bundledClosure.trim(), closureJsonl.trim());
assert.equal(bundledSurface.trim(), surfaceJsonl.trim());
console.log(JSON.stringify({ status: "purpose-visualization-stage-b-check-pass", adapter: manifest.adapter }, null, 2));
