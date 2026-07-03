import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = path.join(root, ".github", "workflows");
const intentRows = fs.readFileSync(path.join(root, "ci.intent.v1.jsonl"), "utf8").trim().split(/\n+/).map((line) => JSON.parse(line));
assert.equal(intentRows.length, 6);
const primary = find((row) => row.kind === "ui.ciIntent.v1", "primary ci intent");
assert.equal(primary.command, "nix flake check --print-build-logs && nix build --print-build-logs .#gov-package-output --out-link result-gov-package-output");
assert.deepEqual(primary.entrypoints, [".github/workflows/nix-flake-check.yml"]);
assert.match(primary.authority, /non-authority/);
assert.deepEqual(primary.artifacts, ["ui-gov-package-output"]);

const artifact = byRole("artifact_exporter");
assert.equal(artifact.path, ".github/workflows/readme-artifact.yml");
assert.equal(artifact.entrypoint, "nix build .#readme-artifact");
assert.equal(artifact.authority, false);
assert.equal(artifact.source, "nix-output");

const adapterArtifact = byRole("adapter_artifact_exporter");
assert.equal(adapterArtifact.path, ".github/workflows/a2ui-adapter-artifacts.yml");
assert.match(adapterArtifact.entrypoint, /build\.mjs/);
assert.match(adapterArtifact.entrypoint, /build-geomap-proof\.mjs/);
assert.match(adapterArtifact.entrypoint, /build-geomap-zip-parity\.mjs/);
assert.match(adapterArtifact.entrypoint, /build-geomap-runtime-hardening\.mjs/);
assert.match(adapterArtifact.entrypoint, /check-geomap-final-gate\.mjs/);
assert.deepEqual(adapterArtifact.artifacts, ["live-adapter-artifact", "purpose-adapter-artifact", "property-map-geo-artifact", "property-map-zip-parity-artifact", "property-map-geo-runtime-hardening-artifact", "adapter-artifact-index"]);

const packageValidation = byRole("package_validation");
assert.equal(packageValidation.path, ".github/workflows/gov-package-validation.yml");
assert.match(packageValidation.entrypoint, /check-package-export\.py check/);
assert.deepEqual(packageValidation.artifacts, ["ui-package-evidence"]);

const prGovernance = byRole("pr_governance");
assert.equal(prGovernance.path, ".github/workflows/pr-governance.yml");
assert.deepEqual(prGovernance.guards, ["linked_issue", "merge_condition", "ci_or_test_evidence", "human_approval", "non_scope"]);

const purposeViz = byRole("purpose_visualization_artifact");
assert.equal(purposeViz.path, ".github/workflows/purpose-visualization-artifact.yml");
assert.match(purposeViz.entrypoint, /build-purpose-visualization-artifact\.mjs/);
assert.match(purposeViz.entrypoint, /smoke-purpose-visualization\.mjs/);
assert.equal(purposeViz.authority, false);
assert.deepEqual(purposeViz.artifacts, ["purpose-visualization-html", "purpose-visualization-screenshots", "purpose-visualization-evidence"]);

const workflowFiles = fs.readdirSync(workflowsDir).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml")).map((name) => `.github/workflows/${name}`).sort();
assert.deepEqual(workflowFiles, [...primary.entrypoints, artifact.path, adapterArtifact.path, packageValidation.path, prGovernance.path, purposeViz.path].sort());

const primaryText = read(primary.entrypoints[0]);
assert.match(primaryText, /name:\s*Nix Flake Check/);
assert.match(primaryText, /nix flake check --print-build-logs/);
assert.match(primaryText, /nix build --print-build-logs \.#gov-package-output --out-link result-gov-package-output/);
assert.match(primaryText, /actions\/upload-artifact@v4/);
assert.match(primaryText, /name:\s*ui-gov-package-output/);
assert.doesNotMatch(primaryText, /setup-node|npm test|node scripts\/build-generic-a2ui-preview/);

const artifactText = read(artifact.path);
assert.match(artifactText, /name:\s*README artifact exporter/);
assert.match(artifactText, /nix build --print-build-logs \.#readme-artifact/);
assert.match(artifactText, /actions\/upload-artifact@v4/);

const adapterText = read(adapterArtifact.path);
assert.match(adapterText, /name:\s*A2UI adapter artifacts/);
assert.match(adapterText, /fonts-noto-cjk/);
for (const name of adapterArtifact.artifacts) assert.match(adapterText, new RegExp(`name:\\s*${name}`));

const packageValidationText = read(packageValidation.path);
assert.match(packageValidationText, /name:\s*Governance package validation/);
assert.match(packageValidationText, /repository:\s*roccho-dev\/governance/);
assert.match(packageValidationText, /check-package-export\.py check/);
for (const name of packageValidation.artifacts) assert.match(packageValidationText, new RegExp(`name:\\s*${name}`));

const prGovernanceText = read(prGovernance.path);
assert.match(prGovernanceText, /name:\s*PR governance/);
assert.match(prGovernanceText, /pull_request:/);
assert.match(prGovernanceText, /node tests\/check-pr-governance\.mjs/);
assert.match(prGovernanceText, /node tests\/check-pr-body-governance\.mjs/);

const purposeVizText = read(purposeViz.path);
assert.match(purposeVizText, /name:\s*Purpose visualization artifact/);
assert.match(purposeVizText, /node scripts\/build-purpose-visualization-artifact\.mjs purpose-visualization-result/);
assert.match(purposeVizText, /node scripts\/smoke-purpose-visualization\.mjs purpose-visualization-result/);
for (const name of purposeViz.artifacts) assert.match(purposeVizText, new RegExp(`name:\\s*${name}`));
for (const forbiddenPath of primary.forbiddenEntryGlobs) assert.equal(fs.existsSync(path.join(root, forbiddenPath)), false, `${forbiddenPath} must not be a provider CI entrypoint`);
console.log(JSON.stringify({ status: "ui-ci-workflows-check-pass", entrypoints: workflowFiles }, null, 2));

function find(predicate, label) {
  const row = intentRows.find(predicate);
  assert.ok(row, `missing ${label}`);
  return row;
}
function byRole(role) {
  return find((row) => row.kind === "ci.intent.v1" && row.role === role, `ci intent role ${role}`);
}
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}
