import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = path.join(root, ".github", "workflows");
const intentPath = path.join(root, "ci.intent.v1.jsonl");
const intentRows = fs.readFileSync(intentPath, "utf8").trim().split(/\n+/).map((line) => JSON.parse(line));
assert.equal(intentRows.length, 3);

const primary = intentRows.find((row) => row.kind === "ui.ciIntent.v1");
assert.ok(primary);
assert.equal(primary.command, "nix flake check --print-build-logs");
assert.deepEqual(primary.entrypoints, [".github/workflows/nix-flake-check.yml"]);
assert.match(primary.authority, /non-authority/);

const artifact = intentRows.find((row) => row.kind === "ci.intent.v1" && row.role === "artifact_exporter");
assert.ok(artifact);
assert.equal(artifact.path, ".github/workflows/readme-artifact.yml");
assert.equal(artifact.entrypoint, "nix build .#readme-artifact");
assert.equal(artifact.authority, false);
assert.equal(artifact.source, "nix-output");
assert.equal(artifact.generation_mode, "checked_in");
assert.equal(artifact.workflow_definition, "checked_in");
assert.equal(artifact.artifact_source, "nix-output");
assert.equal(artifact.artifact_generation, "generated");

const adapterArtifact = intentRows.find((row) => row.kind === "ci.intent.v1" && row.role === "adapter_artifact_exporter");
assert.ok(adapterArtifact);
assert.equal(adapterArtifact.path, ".github/workflows/a2ui-adapter-artifacts.yml");
assert.match(adapterArtifact.entrypoint, /build\.mjs/);
assert.match(adapterArtifact.entrypoint, /build-geomap-proof\.mjs/);
assert.match(adapterArtifact.entrypoint, /build-geomap-zip-parity\.mjs/);
assert.match(adapterArtifact.entrypoint, /build-geomap-runtime-hardening\.mjs/);
assert.match(adapterArtifact.entrypoint, /check-geomap-final-gate\.mjs/);
assert.equal(adapterArtifact.authority, false);
assert.equal(adapterArtifact.source, "node-output");
assert.deepEqual(adapterArtifact.artifacts, ["live-adapter-artifact", "purpose-adapter-artifact", "property-map-geo-artifact", "property-map-zip-parity-artifact", "property-map-geo-runtime-hardening-artifact", "adapter-artifact-index"]);

const workflowFiles = fs.readdirSync(workflowsDir).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml")).map((name) => `.github/workflows/${name}`).sort();
assert.deepEqual(workflowFiles, [...primary.entrypoints, artifact.path, adapterArtifact.path].sort());

const primaryText = fs.readFileSync(path.join(root, primary.entrypoints[0]), "utf8");
assert.match(primaryText, /name:\s*Nix Flake Check/);
assert.match(primaryText, /nix flake check --print-build-logs/);
assert.doesNotMatch(primaryText, /upload-artifact|setup-node|npm test|node scripts\/build-generic-a2ui-preview/);

const artifactText = fs.readFileSync(path.join(root, artifact.path), "utf8");
assert.match(artifactText, /name:\s*README artifact exporter/);
assert.match(artifactText, /nix build --print-build-logs \.#readme-artifact/);
assert.match(artifactText, /actions\/upload-artifact@v4/);
assert.doesNotMatch(artifactText, /npm test|node scripts\/build-generic-a2ui-preview/);

const adapterText = fs.readFileSync(path.join(root, adapterArtifact.path), "utf8");
assert.match(adapterText, /name:\s*A2UI adapter artifacts/);
assert.match(adapterText, /fonts-noto-cjk/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/build\.mjs/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/build-geomap-proof\.mjs/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/build-geomap-zip-parity\.mjs/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/build-geomap-runtime-hardening\.mjs/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/check-geomap-final-gate\.mjs/);
assert.match(adapterText, /GEOMAP_ZIP_PARITY_RENDER/);
assert.match(adapterText, /GEOMAP_ZIP_PARITY_INTERACTION/);
assert.match(adapterText, /GEOMAP_RUNTIME_ARTIFACT_OUT/);
assert.match(adapterText, /actions\/upload-artifact@v4/);
for (const name of adapterArtifact.artifacts) assert.match(adapterText, new RegExp(`name:\\s*${name}`));

for (const forbiddenPath of primary.forbiddenEntryGlobs) {
  assert.equal(fs.existsSync(path.join(root, forbiddenPath)), false, `${forbiddenPath} must not be a provider CI entrypoint`);
}
console.log(JSON.stringify({ status: "ui-ci-workflows-check-pass", entrypoints: workflowFiles }, null, 2));
