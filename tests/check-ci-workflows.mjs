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
const requireText = (text, patterns) => { for (const pattern of patterns) assert.match(text, pattern); };
const forbidText = (text, patterns) => { for (const pattern of patterns) assert.doesNotMatch(text, pattern); };

assert.equal(intents.length, 9);
const primary = intents.find(intent => intent.kind === "ui.ciIntent.v1");
assert.ok(primary);
assert.deepEqual(primary.entrypoints, [".github/workflows/nix-flake-check.yml"]);
assert.equal(primary.authority, "generated/non-authority provider CI adapter");
assert.equal(primary.sourceOfCiMeaning, "ci.intent.v1.jsonl");
assert.deepEqual(primary.forbiddenEntryGlobs, [".github/workflows/generic-a2ui-preview.yml", ".github/workflows/purpose-atlas-preview.yml"]);
assert.deepEqual(primary.artifacts, ["ui-gov-package-output"]);

const records = intents.filter(intent => intent.kind === "ci.intent.v1");
assert.equal(records.length, 8);
assert.equal(new Set(records.map(intent => intent.path)).size, records.length);
assert.equal(new Set(records.map(intent => intent.role)).size, records.length);
for (const intent of records) {
  assert.equal(intent.provider, "github-actions");
  assert.equal(intent.authority, false);
  assert.equal(intent.workflow_definition, "checked_in");
  assert.equal(fs.existsSync(path.join(repo, intent.path)), true, `missing workflow: ${intent.path}`);
}

const workflowFiles = fs.readdirSync(workflowsDir)
  .filter(name => name.endsWith(".yml") || name.endsWith(".yaml"))
  .map(name => `.github/workflows/${name}`)
  .sort();
assert.deepEqual(workflowFiles, [...primary.entrypoints, ...records.map(intent => intent.path)].sort());
for (const forbidden of primary.forbiddenEntryGlobs) assert.equal(fs.existsSync(path.join(repo, forbidden)), false, `forbidden workflow exists: ${forbidden}`);

const primaryText = read(primary.entrypoints[0]);
requireText(primaryText, [
  /name:\s*Nix Flake Check/,
  /nix flake check --print-build-logs/,
  /nix build --print-build-logs \.#gov-package-output --out-link result-gov-package-output/,
  /--no-write-lock-file/,
  /actions\/upload-artifact@v4/,
  /name:\s*ui-gov-package-output/,
]);
forbidText(primaryText, [/setup-node/, /npm test/, /node scripts\/build-generic-a2ui-preview/]);

const artifact = byRole("artifact_exporter");
assert.equal(artifact.path, ".github/workflows/readme-artifact.yml");
assert.equal(artifact.entrypoint, "nix build .#readme-artifact");
assert.equal(artifact.source, "nix-output");
assert.deepEqual(artifact.dispatch, ["pull_request", "push", "workflow_dispatch"]);
assert.equal(artifact.artifact_source, "nix-output");
assert.equal(artifact.artifact_generation, "generated");
const artifactText = read(artifact.path);
requireText(artifactText, [/name:\s*README artifact exporter/, /nix build --print-build-logs \.#readme-artifact/, /actions\/upload-artifact@v4/]);
forbidText(artifactText, [/npm test/, /node scripts\/build-generic-a2ui-preview/]);

const adapterArtifact = byRole("adapter_artifact_exporter");
assert.equal(adapterArtifact.path, ".github/workflows/a2ui-adapter-artifacts.yml");
for (const script of ["check:base", "check:artifact-runtime-core", "check:semantic-map-runtime", "check:decision-packet-runtime"]) assert.match(adapterArtifact.entrypoint, new RegExp(script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(adapterArtifact.entrypoint, /change-scoped Wrangler\/Caddy proof/);
assert.equal(adapterArtifact.source, "node-output plus change-scoped Wrangler and Caddy real-browser interaction proof");
assert.equal(adapterArtifact.artifact_source, "node-output plus conditional browser-generated non-authority evidence");
assert.deepEqual(adapterArtifact.proof_inputs, { wrangler: "4.112.0", caddy: "v2.11.3", caddy_role: "static file serving only", watcher: "node-builtins" });
assert.equal(adapterArtifact.proof_execution.mode, "relevant_paths_or_workflow_dispatch");
assert.equal(adapterArtifact.proof_execution.fail_closed, true);
assert.equal(adapterArtifact.proof_execution.scheduled, false);
assert.deepEqual(adapterArtifact.proof_execution.conditional_steps, ["Caddy install", "Wrangler proof", "Caddy proof", "ssg-hot-refresh-viewport-artifact upload"]);
const adapterText = read(adapterArtifact.path);
for (const job of ["ui-base-checks", "artifact-runtime-core", "semantic-map-runtime-checks", "decision-packet-runtime-checks", "semantic-browser-proof", "ssg-hot-refresh-proof", "adapter-artifacts"]) assert.match(adapterText, new RegExp(`\\n  ${job}:`));
requireText(adapterText, [
  /python3 packages\/semantic-map\/tests\/browser_example\.py/,
  /npm run proof:semantic-map-meaning-recovery/,
  /python3 packages\/decision-packet\/tests\/browser-example\.py/,
  /python3 apps\/artifact-shell\/tests\/browser-proof\.py/,
  /python3 apps\/artifact-shell\/tests\/decision-packet-browser-proof\.py/,
  /node packages\/a2ui-adapter-artifacts\/scripts\/build\.mjs/,
  /node scripts\/build-contract-model-atlas-artifact\.mjs/,
  /node packages\/a2ui-adapter-artifacts\/scripts\/build-repo-map-svgpanzoom\.mjs/,
  /node packages\/a2ui-adapter-artifacts\/scripts\/check-geomap-final-gate\.mjs/,
  /CADDY_EXPECTED_VERSION:\s*v2\.11\.3/,
  /name:\s*adapter-artifact-index/,
]);

const packageValidation = byRole("package_validation");
assert.equal(packageValidation.path, ".github/workflows/gov-package-validation.yml");
assert.equal(packageValidation.artifact_source, "tracked-package-evidence");
assert.deepEqual(packageValidation.artifacts, ["ui-package-evidence"]);
requireText(read(packageValidation.path), [/name:\s*Governance package validation/, /check-package-export\.py check/, /check-ui-package-evidence\.mjs/, /check-ui-gov-package-output\.mjs/, /name:\s*ui-package-evidence/]);

const prGovernance = byRole("pr_governance");
assert.equal(prGovernance.path, ".github/workflows/pr-governance.yml");
assert.deepEqual(prGovernance.guards, ["linked_issue", "merge_condition", "ci_or_test_evidence", "human_approval", "non_scope"]);
requireText(read(prGovernance.path), [/name:\s*PR governance/, /check-pr-governance\.mjs/, /check-pr-body-governance\.mjs/]);

const purposeViz = byRole("purpose_visualization_artifact");
assert.equal(purposeViz.path, ".github/workflows/purpose-visualization-artifact.yml");
assert.equal(purposeViz.input_contract.kind, "ui.purposeVisualizationInputContract.v1");
assert.deepEqual(purposeViz.artifacts, ["purpose-visualization-html", "purpose-visualization-screenshots", "purpose-visualization-evidence"]);
requireText(read(purposeViz.path), [/name:\s*Purpose visualization artifact/, /nix build --print-build-logs \.#purpose-visualization-artifact --out-link result-purpose-visualization/, /smoke-purpose-visualization\.mjs/]);

const finalConsumer = byPath(".github/workflows/final-ci-consumer.yml");
assert.equal(finalConsumer.role, "bootstrap_exception");
assert.equal(finalConsumer.final_role, "evidence-only selected positive consumer input");
assert.equal(finalConsumer.exception.owner, "governance#150");
requireText(read(finalConsumer.path), [/name:\s*final CI consumer/, /check-final-ci-consumer\.py/]);

const gestureJoin = byRole("semantic_map_gesture_review_join");
assert.equal(gestureJoin.path, ".github/workflows/semantic-map-gesture-review-join.yml");
assert.deepEqual(gestureJoin.dispatch, ["pull_request", "workflow_dispatch"]);
const expectedGesturePaths = [
  "packages/semantic-map/**",
  "packages/business-model/**",
  "examples/shared/**",
  "examples/chart/**",
  "examples/render.semantic-map.set-topology/**",
  "apps/preview/**",
  "apps/artifact-shell/tests/maxgraph-active-list-browser-proof.py",
  "apps/artifact-shell/tests/maxgraph-edge-authoring-browser-proof.py",
  "apps/artifact-shell/tests/maxgraph-edge-hit-target-browser-proof.py",
  "apps/artifact-shell/tests/maxgraph-keyboard-shortcuts-browser-proof.py",
  ".github/workflows/semantic-map-gesture-review-join.yml",
];
assert.deepEqual(gestureJoin.pull_request_paths, expectedGesturePaths);
for (const value of [gestureJoin.entrypoint, gestureJoin.source]) forbidText(value, [/artifact-shell\/adapters/, /feature-data-publication/, /chart-publication-browser-proof/, /artifact-shell\/tests\/unified-runtime-data-browser-proof/]);
const gestureJoinText = read(gestureJoin.path);
requireText(gestureJoinText, [
  /name:\s*Semantic Map gesture-review join/,
  /node packages\/semantic-map\/tests\/run\.mjs/,
  /npm --prefix apps\/preview run check/,
  /python3 apps\/preview\/tests\/unified-runtime-data-browser-proof\.py/,
  /set_topology_gesture_review_join_browser_e2e\.py/,
  /maxgraph-active-list-browser-proof\.py/,
  /maxgraph-edge-authoring-browser-proof\.py/,
  /maxgraph-edge-hit-target-browser-proof\.py/,
  /maxgraph-keyboard-shortcuts-browser-proof\.py/,
  /python3 apps\/preview\/tests\/chart-browser-proof\.py/,
  /ref:\s*\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/,
]);
for (const relative of expectedGesturePaths) assert.match(gestureJoinText, new RegExp(relative.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*\\\*/g, ".*")));

const stgPreview = byRole("stg_preview_deployer");
assert.equal(stgPreview.path, ".github/workflows/stg-t271.yml");
assert.deepEqual(stgPreview.dispatch, ["pull_request"]);
assert.equal(stgPreview.provider_effect, "cloudflare-pages-preview");
assert.equal(stgPreview.artifact_source, "Vite preview output plus deployed browser proof");
assert.deepEqual(stgPreview.naming, { environment: "stg", target_pr: 271, source: "pull_request.number", pattern: "stg-t<target>-s<source>", project: "ui-runtime" });
const stgPreviewText = read(stgPreview.path);
requireText(stgPreviewText, [
  /name:\s*"Staging preview for #271"/,
  /STG_TARGET_PR:\s*"271"/,
  /CLOUDFLARE_PAGES_PROJECT:\s*ui-runtime/,
  /SOURCE_PR:\s*\$\{\{ github\.event\.pull_request\.number \}\}/,
  /scope="stg-t\$\{STG_TARGET_PR\}-s\$\{SOURCE_PR\}"/,
  /npm --prefix apps\/preview run check/,
  /npm --prefix apps\/preview run build/,
  /wrangler@4\.112\.0 pages deploy/,
  /--project-name="\$CLOUDFLARE_PAGES_PROJECT"/,
  /--branch="\$CLOUDFLARE_PAGES_BRANCH"/,
  /python3 apps\/preview\/tests\/deployed-browser-proof\.py/,
]);
forbidText(stgPreviewText, [/build:artifact-shell-publication/, /STG_THEME/, /ui-beauty/, /github\.head_ref/, /pull_request\.head\.ref/]);

const packageJson = JSON.parse(read("package.json"));
for (const script of ["check:base", "check:artifact-runtime-core", "check:semantic-map-runtime", "check:decision-packet-runtime"]) assert.equal(typeof packageJson.scripts[script], "string");

console.log("ci-workflows-check-pass");
