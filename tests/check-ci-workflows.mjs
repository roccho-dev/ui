import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(repo, relative), "utf8");
const intents = read("ci.intent.v1.jsonl").trim().split(/\r?\n/u).filter(Boolean).map(JSON.parse);
const workflowsDir = path.join(repo, ".github", "workflows");
const byPath = value => intents.find(intent => intent.path === value);
const byRole = value => intents.find(intent => intent.role === value);

assert.equal(intents.length, 9);
const primary = intents.find(intent => intent.kind === "ui.ciIntent.v1");
assert.ok(primary);
assert.deepEqual(primary.entrypoints, [".github/workflows/nix-flake-check.yml"]);
assert.equal(primary.authority, "generated/non-authority provider CI adapter");
assert.equal(primary.sourceOfCiMeaning, "ci.intent.v1.jsonl");
assert.deepEqual(primary.forbiddenEntryGlobs, [".github/workflows/generic-a2ui-preview.yml", ".github/workflows/purpose-atlas-preview.yml"]);
assert.deepEqual(primary.artifacts, ["ui-gov-package-output"]);

const artifact = byRole("artifact_exporter");
assert.equal(artifact.path, ".github/workflows/readme-artifact.yml");
assert.equal(artifact.entrypoint, "nix build .#readme-artifact");
assert.equal(artifact.authority, false);
assert.equal(artifact.source, "nix-output");
assert.deepEqual(artifact.dispatch, ["pull_request", "push", "workflow_dispatch"]);
assert.equal(artifact.generation_mode, "checked_in");
assert.equal(artifact.workflow_definition, "checked_in");
assert.equal(artifact.artifact_source, "nix-output");
assert.equal(artifact.artifact_generation, "generated");

const adapterArtifact = byRole("adapter_artifact_exporter");
assert.equal(adapterArtifact.path, ".github/workflows/a2ui-adapter-artifacts.yml");
assert.equal(adapterArtifact.authority, false);
assert.match(adapterArtifact.entrypoint, /check:base/);
assert.match(adapterArtifact.entrypoint, /check:artifact-runtime-core/);
assert.match(adapterArtifact.entrypoint, /check:semantic-map-runtime/);
assert.match(adapterArtifact.entrypoint, /check:decision-packet-runtime/);
assert.match(adapterArtifact.entrypoint, /change-scoped Wrangler\/Caddy proof/);
assert.match(adapterArtifact.entrypoint, /build\.mjs/);
assert.match(adapterArtifact.entrypoint, /build-contract-model-atlas-artifact\.mjs/);
assert.match(adapterArtifact.entrypoint, /build-repo-map-svgpanzoom\.mjs/);
assert.match(adapterArtifact.entrypoint, /patch-repo-map-svgpanzoom-preview\.mjs/);
assert.match(adapterArtifact.entrypoint, /smoke-repo-map-svgpanzoom\.mjs/);
assert.match(adapterArtifact.entrypoint, /build-geomap-proof\.mjs/);
assert.match(adapterArtifact.entrypoint, /build-geomap-zip-parity\.mjs/);
assert.match(adapterArtifact.entrypoint, /build-geomap-runtime-hardening\.mjs/);
assert.match(adapterArtifact.entrypoint, /check-geomap-final-gate\.mjs/);
assert.equal(adapterArtifact.source, "node-output plus change-scoped Wrangler and Caddy real-browser interaction proof");
assert.equal(adapterArtifact.generation_mode, "checked_in");
assert.equal(adapterArtifact.workflow_definition, "checked_in");
assert.equal(adapterArtifact.artifact_source, "node-output plus conditional browser-generated non-authority evidence");
assert.equal(adapterArtifact.artifact_generation, "generated");
assert.deepEqual(adapterArtifact.proof_inputs, { wrangler: "4.112.0", caddy: "v2.11.3", caddy_role: "static file serving only", watcher: "node-builtins" });
assert.equal(adapterArtifact.proof_execution.mode, "relevant_paths_or_workflow_dispatch");
assert.equal(adapterArtifact.proof_execution.unconditional_static_guard, "npm run check:base + npm run check:artifact-runtime-core + npm run check:semantic-map-runtime + npm run check:decision-packet-runtime");
assert.equal(adapterArtifact.proof_execution.fail_closed, true);
assert.equal(adapterArtifact.proof_execution.scheduled, false);
assert.deepEqual(adapterArtifact.proof_execution.relevant_paths, [
  ".github/workflows/a2ui-adapter-artifacts.yml",
  "package.json",
  "packages/a2ui-adapter-artifacts/dev/ssg-output-refresh.js",
  "packages/a2ui-adapter-artifacts/scripts/build-ssg-hot-refresh-proof.mjs",
  "tests/check-ssg-hot-refresh-viewport.py",
  "tests/check-ssg-hot-refresh-yagni.mjs",
  "tests/fixtures/ssg-hot-refresh-viewport/**",
]);
assert.deepEqual(adapterArtifact.proof_execution.conditional_steps, ["Caddy install", "Wrangler proof", "Caddy proof", "ssg-hot-refresh-viewport-artifact upload"]);
assert.deepEqual(adapterArtifact.artifacts, ["ssg-hot-refresh-viewport-artifact", "live-adapter-artifact", "purpose-adapter-artifact", "contract-model-atlas-artifact", "repo-map-svgpanzoom-artifact", "property-map-geo-artifact", "property-map-zip-parity-artifact", "property-map-geo-runtime-hardening-artifact", "adapter-artifact-index"]);

const packageValidation = byRole("package_validation");
assert.equal(packageValidation.path, ".github/workflows/gov-package-validation.yml");
assert.match(packageValidation.entrypoint, /check-package-export\.py check/);
assert.match(packageValidation.entrypoint, /check-ui-package-evidence\.mjs/);
assert.match(packageValidation.entrypoint, /check-ui-gov-package-output\.mjs/);
assert.equal(packageValidation.authority, false);
assert.equal(packageValidation.source, "governance-export plus ui-package-response-output");
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

const gestureJoin = byRole("semantic_map_gesture_review_join");
assert.equal(gestureJoin.path, ".github/workflows/semantic-map-gesture-review-join.yml");
assert.equal(gestureJoin.entrypoint, "node packages/semantic-map/tests/run.mjs + python3 apps/artifact-shell/tests/unified-runtime-data-browser-proof.py + PYTHONPATH=packages/semantic-map/tests python3 packages/semantic-map/tests/set_topology_gesture_review_join_browser_e2e.py");
assert.equal(gestureJoin.source, "packages/semantic-map/tests + apps/artifact-shell/tests/unified-runtime-data-browser-proof.py + packages/semantic-map/tests/set_topology_gesture_review_join_browser_e2e.py");
assert.equal(gestureJoin.provider, "github-actions");
assert.equal(gestureJoin.authority, false);
assert.deepEqual(gestureJoin.dispatch, ["pull_request", "workflow_dispatch"]);
assert.equal(gestureJoin.generation_mode, "checked_in");
assert.equal(gestureJoin.workflow_definition, "checked_in");
assert.equal(gestureJoin.artifact_source, "none");
assert.equal(gestureJoin.artifact_generation, "none");

const stgPreview = byRole("stg_preview_deployer");
assert.equal(stgPreview.path, ".github/workflows/stg-ui-beauty-t271.yml");
assert.equal(stgPreview.provider, "github-actions");
assert.equal(stgPreview.authority, false);
assert.deepEqual(stgPreview.dispatch, ["pull_request"]);
assert.equal(stgPreview.provider_effect, "cloudflare-pages-preview");
assert.deepEqual(stgPreview.naming, {
  environment: "stg",
  theme: "ui-beauty",
  target_pr: 271,
  source: "pull_request.number",
  pattern: "stg-<theme>-t<target>-s<source>",
  project: "stg-artifact-runtime",
});

const workflowFiles = fs.readdirSync(workflowsDir).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml")).map((name) => `.github/workflows/${name}`).sort();
assert.deepEqual(workflowFiles, [...primary.entrypoints, artifact.path, adapterArtifact.path, packageValidation.path, prGovernance.path, purposeViz.path, finalConsumer.path, gestureJoin.path, stgPreview.path].sort());
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

const packageJson = JSON.parse(read("package.json"));
assert.equal(typeof packageJson.scripts["check:base"], "string");
assert.equal(typeof packageJson.scripts["check:artifact-runtime-core"], "string");
assert.equal(typeof packageJson.scripts["check:semantic-map-runtime"], "string");
assert.equal(typeof packageJson.scripts["check:decision-packet-runtime"], "string");

const adapterText = read(adapterArtifact.path);
assert.match(adapterText, /name:\s*A2UI adapter artifacts/);
for (const jobName of ["ui-base-checks", "artifact-runtime-core", "semantic-map-runtime-checks", "decision-packet-runtime-checks", "semantic-browser-proof", "ssg-hot-refresh-proof", "adapter-artifacts"]) assert.match(adapterText, new RegExp(`\\n  ${jobName}:`));
for (const scriptName of ["check:base", "check:artifact-runtime-core", "check:semantic-map-runtime", "check:decision-packet-runtime"]) assert.match(adapterText, new RegExp(`npm run ${scriptName.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`));
assert.match(adapterText, /python3 packages\/semantic-map\/tests\/browser_example\.py/);
assert.match(adapterText, /npm run proof:semantic-map-meaning-recovery/);
assert.match(adapterText, /python3 packages\/decision-packet\/tests\/browser-example\.py/);
assert.match(adapterText, /python3 apps\/artifact-shell\/tests\/browser-proof\.py/);
assert.match(adapterText, /python3 apps\/artifact-shell\/tests\/decision-packet-browser-proof\.py/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/build\.mjs/);
assert.match(adapterText, /node scripts\/build-contract-model-atlas-artifact\.mjs/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/build-repo-map-svgpanzoom\.mjs/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/patch-repo-map-svgpanzoom-preview\.mjs/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/smoke-repo-map-svgpanzoom\.mjs/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/build-geomap-proof\.mjs/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/build-geomap-zip-parity\.mjs/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/build-geomap-runtime-hardening\.mjs/);
assert.match(adapterText, /node packages\/a2ui-adapter-artifacts\/scripts\/check-geomap-final-gate\.mjs/);
assert.match(adapterText, /if:\s*steps\.ssg_proof_scope\.outputs\.run == 'true'/);
assert.match(adapterText, /python3 tests\/check-ssg-hot-refresh-viewport\.py --server wrangler/);
assert.match(adapterText, /CADDY_EXPECTED_VERSION:\s*v2\.11\.3/);
assert.match(adapterText, /name:\s*ssg-hot-refresh-viewport-artifact/);
assert.match(adapterText, /name:\s*live-adapter-artifact/);
assert.match(adapterText, /name:\s*purpose-adapter-artifact/);
assert.match(adapterText, /name:\s*contract-model-atlas-artifact/);
assert.match(adapterText, /name:\s*repo-map-svgpanzoom-artifact/);
assert.match(adapterText, /name:\s*property-map-geo-artifact/);
assert.match(adapterText, /name:\s*property-map-zip-parity-artifact/);
assert.match(adapterText, /name:\s*property-map-geo-runtime-hardening-artifact/);
assert.match(adapterText, /name:\s*adapter-artifact-index/);

const packageValidationText = read(packageValidation.path);
assert.match(packageValidationText, /name:\s*Governance package validation/);
assert.match(packageValidationText, /check-package-export\.py check/);
assert.match(packageValidationText, /check-ui-package-evidence\.mjs/);
assert.match(packageValidationText, /check-ui-gov-package-output\.mjs/);
assert.match(packageValidationText, /name:\s*ui-package-evidence/);

const prGovernanceText = read(prGovernance.path);
assert.match(prGovernanceText, /name:\s*PR governance/);
assert.match(prGovernanceText, /check-pr-governance\.mjs/);
assert.match(prGovernanceText, /check-pr-body-governance\.mjs/);

const purposeVizText = read(purposeViz.path);
assert.match(purposeVizText, /name:\s*Purpose visualization artifact/);
assert.match(purposeVizText, /nix build --print-build-logs \.#purpose-visualization-artifact --out-link result-purpose-visualization/);
assert.match(purposeVizText, /smoke-purpose-visualization\.mjs/);
assert.match(purposeVizText, /name:\s*purpose-visualization-html/);
assert.match(purposeVizText, /name:\s*purpose-visualization-screenshots/);
assert.match(purposeVizText, /name:\s*purpose-visualization-evidence/);

const finalConsumerText = read(finalConsumer.path);
assert.match(finalConsumerText, /name:\s*final CI consumer/);
assert.match(finalConsumerText, /check-final-ci-consumer\.py/);

const gestureJoinText = read(gestureJoin.path);
assert.match(gestureJoinText, /name:\s*Semantic Map gesture-review join/);
assert.match(gestureJoinText, /node packages\/semantic-map\/tests\/run\.mjs/);
assert.match(gestureJoinText, /python3 apps\/artifact-shell\/tests\/unified-runtime-data-browser-proof\.py/);
assert.match(gestureJoinText, /set_topology_gesture_review_join_browser_e2e\.py/);
assert.match(gestureJoinText, /maxgraph-active-list-browser-proof\.py/);
assert.match(gestureJoinText, /maxgraph-edge-authoring-browser-proof\.py/);
assert.match(gestureJoinText, /maxgraph-edge-hit-target-browser-proof\.py/);
assert.match(gestureJoinText, /maxgraph-keyboard-shortcuts-browser-proof\.py/);

const stgPreviewText = read(stgPreview.path);
assert.match(stgPreviewText, /name:\s*"Staging preview for #271"/);
assert.match(stgPreviewText, /STG_THEME:\s*ui-beauty/);
assert.match(stgPreviewText, /STG_TARGET_PR:\s*"271"/);
assert.match(stgPreviewText, /SOURCE_PR:\s*\$\{\{ github\.event\.pull_request\.number \}\}/);
assert.match(stgPreviewText, /scope="stg-\$\{STG_THEME\}-t\$\{STG_TARGET_PR\}-s\$\{SOURCE_PR\}"/);
assert.match(stgPreviewText, /wrangler@4\.112\.0 pages deploy/);
assert.match(stgPreviewText, /--project-name="\$CLOUDFLARE_PAGES_PROJECT"/);
assert.match(stgPreviewText, /--branch="\$CLOUDFLARE_PAGES_BRANCH"/);
assert.doesNotMatch(stgPreviewText, /github\.head_ref|pull_request\.head\.ref/);

for (const forbidden of primary.forbiddenEntryGlobs) assert.equal(fs.existsSync(path.join(repo, forbidden)), false, `forbidden workflow exists: ${forbidden}`);
console.log("ci-workflows-check-pass");
