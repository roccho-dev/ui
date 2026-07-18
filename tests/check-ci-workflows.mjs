import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = path.join(root, ".github", "workflows");
const intentRows = fs.readFileSync(path.join(root, "ci.intent.v1.jsonl"), "utf8").trim().split(/\n+/).map((line) => JSON.parse(line));
assert.equal(intentRows.length, 7);

const primary = byKind("ui.ciIntent.v1");
assert.equal(primary.command, "nix flake check --print-build-logs && nix build --print-build-logs .#gov-package-output --out-link result-gov-package-output");
assert.deepEqual(primary.entrypoints, [".github/workflows/nix-flake-check.yml"]);
assert.match(primary.authority, /non-authority/);
assert.deepEqual(primary.artifacts, ["ui-gov-package-output"]);

const artifact = byRole("artifact_exporter");
assert.equal(artifact.path, ".github/workflows/readme-artifact.yml");
assert.equal(artifact.entrypoint, "nix build .#readme-artifact");
assert.equal(artifact.authority, false);
assert.equal(artifact.source, "nix-output");
assert.equal(artifact.generation_mode, "checked_in");
assert.equal(artifact.workflow_definition, "checked_in");
assert.equal(artifact.artifact_source, "nix-output");
assert.equal(artifact.artifact_generation, "generated");

const adapterArtifact = byRole("adapter_artifact_exporter");
assert.equal(adapterArtifact.path, ".github/workflows/a2ui-adapter-artifacts.yml");
assert.match(adapterArtifact.entrypoint, /build\.mjs/);
assert.match(adapterArtifact.entrypoint, /build-contract-model-atlas-artifact\.mjs/);
assert.match(adapterArtifact.entrypoint, /build-repo-map-svgpanzoom\.mjs/);
assert.match(adapterArtifact.entrypoint, /smoke-repo-map-svgpanzoom\.mjs/);
assert.match(adapterArtifact.entrypoint, /build-geomap-proof\.mjs/);
assert.match(adapterArtifact.entrypoint, /build-geomap-zip-parity\.mjs/);
assert.match(adapterArtifact.entrypoint, /build-geomap-runtime-hardening\.mjs/);
assert.match(adapterArtifact.entrypoint, /check-geomap-final-gate\.mjs/);
assert.equal(adapterArtifact.authority, false);
assert.equal(adapterArtifact.source, "node-output");
assert.deepEqual(adapterArtifact.artifacts, ["live-adapter-artifact", "purpose-adapter-artifact", "contract-model-atlas-artifact", "repo-map-svgpanzoom-artifact", "property-map-geo-artifact", "property-map-zip-parity-artifact", "property-map-geo-runtime-hardening-artifact", "adapter-artifact-index"]);

const packageValidation = byRole("package_validation");
assert.equal(packageValidation.path, ".github/workflows/gov-package-validation.yml");
assert.match(packageValidation.entrypoint, /check-package-export\.py check/);
assert.match(packageValidation.entrypoint, /packages\/ui-claims\/package-responses\.v1\.jsonl/);
assert.match(packageValidation.entrypoint, /tests\/check-ui-package-evidence\.mjs/);
assert.match(packageValidation.entrypoint, /tests\/check-ui-gov-package-output\.mjs/);
assert.equal(packageValidation.authority, false);
assert.equal(packageValidation.source, "governance-export plus ui-package-response-output");
assert.equal(packageValidation.generation_mode, "checked_in");
assert.equal(packageValidation.workflow_definition, "checked_in");
assert.equal(packageValidation.artifact_source, "tracked-package-evidence");
assert.equal(packageValidation.artifact_generation, "checked-in-inputs plus ci-validation");
assert.deepEqual(packageValidation.artifacts, ["ui-package-evidence"]);

const prGovernance = byRole("pr_governance");
assert.equal(prGovernance.path, ".github/workflows/pr-governance.yml");
assert.match(prGovernance.entrypoint, /check-pr-governance\.mjs/);
assert.match(prGovernance.entrypoint, /check-pr-body-governance\.mjs/);
assert.equal(prGovernance.authority, false);
assert.equal(prGovernance.source, "pull-request body plus checked-in templates");
assert.deepEqual(prGovernance.guards, ["linked_issue", "merge_condition", "ci_or_test_evidence", "human_approval", "non_scope"]);

const purposeViz = byRole("purpose_visualization_artifact");
assert.equal(purposeViz.path, ".github/workflows/purpose-visualization-artifact.yml");
assert.match(purposeViz.entrypoint, /nix build --print-build-logs \.#purpose-visualization-artifact --out-link result-purpose-visualization/);
assert.match(purposeViz.entrypoint, /smoke-purpose-visualization\.mjs/);
assert.equal(purposeViz.authority, false);
assert.equal(purposeViz.source, "Nix-declared purpose closure JSONL plus Nix-declared purpose atlas surface JSONL");
assert.equal(purposeViz.artifact_source, "nix-output plus runtime-html-output");
assert.equal(purposeViz.artifact_generation, "generated");
assert.equal(purposeViz.input_contract.kind, "ui.purposeVisualizationInputContract.v1");
assert.equal(purposeViz.input_contract.provider, "checked-in-sample");
assert.equal(purposeViz.input_contract.injectedBy, "nix");
assert.deepEqual(purposeViz.input_contract.inputs, ["closure-jsonl", "surface-jsonl"]);
assert.deepEqual(purposeViz.artifacts, ["purpose-visualization-html", "purpose-visualization-screenshots", "purpose-visualization-evidence"]);

const finalConsumer = byPath(".github/workflows/final-ci-consumer.yml");
assert.equal(finalConsumer.role, "bootstrap_exception");
assert.equal(finalConsumer.authority, false);
assert.equal(finalConsumer.source, "accepted ADRS #233 decision plus checked-in repository claim and exact candidate SHA");
assert.equal(finalConsumer.artifact_source, "validation receipt");
assert.equal(finalConsumer.final_role, "evidence-only selected positive consumer input");
assert.equal(finalConsumer.exception.owner, "governance#150");
assert.equal(finalConsumer.exception.expiry, "2026-08-31");

const workflowFiles = fs.readdirSync(workflowsDir).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml")).map((name) => `.github/workflows/${name}`).sort();
assert.deepEqual(workflowFiles, [...primary.entrypoints, artifact.path, adapterArtifact.path, packageValidation.path, prGovernance.path, purposeViz.path, finalConsumer.path].sort());

const primaryText = read(primary.entrypoints[0]);
assert.match(primaryText, /name:\s*Nix Flake Check/);
assert.match(primaryText, /nix flake check --print-build-logs/);
assert.match(primaryText, /nix build --print-build-logs \.#gov-package-output --out-link result-gov-package-output/);
assert.match(primaryText, /--no-write-lock-file/);
assert.match(primaryText, /actions\/upload-artifact@v4/);
assert.match(primaryText, /name:\s*ui-gov-package-output/);
assert.doesNotMatch(primaryText, /setup-node|npm test|node scripts\/build-generic-a2ui-preview/);

const artifactText = read(artifact.path);
assert.match(artifactText, /name:\s*README artifact exporter/);
assert.match(artifactText, /nix build --print-build-logs \.#readme-artifact/);
assert.match(artifactText, /actions\/upload-artifact@v4/);
assert.doesNotMatch(artifactText, /npm test|node scripts\/build-generic-a2ui-preview/);

const adapterText = read(adapterArtifact.path);
assert.match(adapterText, /name:\s*A2UI adapter artifacts/);
assert.match(adapterText, /fonts-noto-cjk/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/build\.mjs/);
assert.match(adapterText, /node scripts\/build-contract-model-atlas-artifact\.mjs/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/build-repo-map-svgpanzoom\.mjs/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/smoke-repo-map-svgpanzoom\.mjs/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/build-geomap-proof\.mjs/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/build-geomap-zip-parity\.mjs/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/build-geomap-runtime-hardening\.mjs/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/check-geomap-final-gate\.mjs/);
assert.match(adapterText, /GEOMAP_ZIP_PARITY_RENDER/);
assert.match(adapterText, /GEOMAP_ZIP_PARITY_INTERACTION/);
assert.match(adapterText, /GEOMAP_RUNTIME_ARTIFACT_OUT/);
assert.match(adapterText, /REPO_MAP_SVGPANZOOM_ARTIFACT_OUT/);
assert.match(adapterText, /actions\/upload-artifact@v4/);
for (const name of adapterArtifact.artifacts) assert.match(adapterText, new RegExp(`name:\\s*${name}`));

const packageValidationText = read(packageValidation.path);
assert.match(packageValidationText, /name:\s*Governance package validation/);
assert.match(packageValidationText, /repository:\s*roccho-dev\/governance/);
assert.match(packageValidationText, /ref:\s*proposals/);
assert.match(packageValidationText, /check-package-export\.py check/);
assert.match(packageValidationText, /--responses packages\/ui-claims\/package-responses\.v1\.jsonl/);
assert.match(packageValidationText, /--report gov-package-validation-report\.json/);
assert.match(packageValidationText, /node tests\/check-ui-package-evidence\.mjs/);
assert.match(packageValidationText, /actions\/upload-artifact@v4/);
assert.match(packageValidationText, /packages\/ui-projection-evidence\/projection-evidence\.v1\.json/);
assert.match(packageValidationText, /packages\/ui-receipts\/receipt\.v1\.json/);
for (const name of packageValidation.artifacts) assert.match(packageValidationText, new RegExp(`name:\\s*${name}`));

const prGovernanceText = read(prGovernance.path);
assert.match(prGovernanceText, /name:\s*PR governance/);
assert.match(prGovernanceText, /pull_request:/);
assert.match(prGovernanceText, /node tests\/check-pr-governance\.mjs/);
assert.match(prGovernanceText, /node tests\/check-pr-body-governance\.mjs/);

const purposeVizText = read(purposeViz.path);
assert.match(purposeVizText, /name:\s*Purpose visualization artifact/);
assert.match(purposeVizText, /cachix\/install-nix-action@v31/);
assert.match(purposeVizText, /nix build --print-build-logs \.#purpose-visualization-artifact --out-link result-purpose-visualization/);
assert.match(purposeVizText, /cp -RL result-purpose-visualization\/\. purpose-visualization-result\//);
assert.match(purposeVizText, /node scripts\/smoke-purpose-visualization\.mjs purpose-visualization-result/);
assert.doesNotMatch(purposeVizText, /node scripts\/build-purpose-visualization-artifact\.mjs purpose-visualization-result/);
assert.match(purposeVizText, /actions\/upload-artifact@v4/);
for (const name of purposeViz.artifacts) assert.match(purposeVizText, new RegExp(`name:\\s*${name}`));

const finalConsumerText = read(finalConsumer.path);
assert.match(finalConsumerText, /name:\s*final CI consumer/);
assert.match(finalConsumerText, /github\.event\.pull_request\.head\.sha \|\| github\.sha/);
assert.match(finalConsumerText, /persist-credentials:\s*false/);
assert.match(finalConsumerText, /check-final-ci-consumer\.py selftest/);
assert.match(finalConsumerText, /check-final-ci-consumer\.py check/);
assert.match(finalConsumerText, /name:\s*final-ci-consumer-receipt/);

for (const forbiddenPath of primary.forbiddenEntryGlobs) assert.equal(fs.existsSync(path.join(root, forbiddenPath)), false, `${forbiddenPath} must not be a provider CI entrypoint`);
console.log(JSON.stringify({ status: "ui-ci-workflows-check-pass", entrypoints: workflowFiles }, null, 2));

function byKind(kind) {
  const row = intentRows.find((item) => item.kind === kind);
  assert.ok(row, `missing ci intent kind ${kind}`);
  return row;
}

function byRole(role) {
  const row = intentRows.find((item) => item.kind === "ci.intent.v1" && item.role === role);
  assert.ok(row, `missing ci intent role ${role}`);
  return row;
}

function byPath(workflowPath) {
  const row = intentRows.find((item) => item.kind === "ci.intent.v1" && item.path === workflowPath);
  assert.ok(row, `missing ci intent path ${workflowPath}`);
  return row;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}
