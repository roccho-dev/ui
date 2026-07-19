import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const implementationPaths = [
  "packages/a2ui-adapter-artifacts/dev/ssg-output-refresh.js",
  "packages/a2ui-adapter-artifacts/scripts/build-ssg-hot-refresh-proof.mjs",
  "tests/fixtures/ssg-hot-refresh-viewport/static/viewer.js",
  "tests/fixtures/ssg-hot-refresh-viewport/src/compile-scene.mjs",
  "tests/check-ssg-hot-refresh-viewport.py",
];
const texts = Object.fromEntries(implementationPaths.map((relative) => [relative, read(relative)]));
const poller = texts[implementationPaths[0]];
const build = texts[implementationPaths[1]];
const viewer = texts[implementationPaths[2]];
const proof = texts[implementationPaths[4]];
const packageJson = JSON.parse(read("package.json"));
const readme = read("README.md");
const workflow = read(".github/workflows/a2ui-adapter-artifacts.yml");
const workflowDir = path.join(root, ".github", "workflows");
const workflows = fs.readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name)).sort();

assert.equal(workflows.length, 7, "the slice must reuse the seven existing workflows");
assert.deepEqual(packageJson.exports, {
  ".": "./packages/core-port/src/index.mjs",
  "./adapters": "./packages/core-port/src/adapters/index.mjs",
  "./registry": "./packages/core-port/src/registry.mjs",
  "./catalog": "./packages/core-port/src/catalog.mjs",
  "./project": "./packages/core-port/src/project.mjs",
  "./log": "./packages/core-port/src/log.mjs",
  "./a2ui-shell-builder": "./packages/core-port/src/a2ui-shell-builder.mjs",
  "./markdown-document-renderer": "./packages/core-port/src/markdown-document-renderer.mjs",
});
assert.equal(packageJson.dependencies, undefined);
assert.equal(packageJson.devDependencies, undefined);
assert.equal(packageJson.scripts["proof:ssg-hot-refresh-viewport"], "python3 tests/check-ssg-hot-refresh-viewport.py");

for (const [relative, text] of Object.entries(texts)) {
  for (const forbidden of ["EventSource", "new WebSocket", "vite", "serviceWorker", "location.reload", "hot-module", "hmr"]) {
    assert.equal(text.toLowerCase().includes(forbidden.toLowerCase()), false, `${relative} contains forbidden scope: ${forbidden}`);
  }
  assert.doesNotMatch(text, /serverAdapter|server_registry|server plugin/i, `${relative} contains premature server abstraction`);
}

for (const forbiddenMeaning of ["viewport", "camera", "svg", "lod", "repoMap", "geoMap", "setData", "setViewport", "caddy", "wrangler"]) {
  assert.equal(poller.toLowerCase().includes(forbiddenMeaning.toLowerCase()), false, `poller owns forbidden meaning: ${forbiddenMeaning}`);
}
assert.match(poller, /intervalMs = 500/);
assert.match(poller, /cache: "no-store"/);
assert.match(poller, /inFlight/);
assert.match(poller, /await refresh\(nextRevision\)/);

assert.match(build, /const watchMode = process\.argv\.includes\("--watch"\)/);
assert.match(build, /watchDirectory/);
assert.match(build, /"content\/scene\.json", "src\/compile-scene\.mjs"/);
assert.match(build, /while \(queued && !closed\)/);
assert.match(build, /ssg-hot-refresh-proof-build-failed/);
assert.match(build, /atomicWrite\(path\.join\(out, "generated", "scene\.json"\), sceneText\)/);
assert.match(build, /Deliberately last/);
assert.ok(build.indexOf("Deliberately last") > build.indexOf("generated\", \"scene.json"), "revision marker must follow generated output");
assert.match(build, /if \(dev\)/);
assert.match(build, /await rm\(pollingClient, \{ force: true \}\)/);
assert.match(build, /await rm\(revisionFile, \{ force: true \}\)/);
assert.doesNotMatch(build, /generatedAt|new Date\(/);
assert.doesNotMatch(build, /caddy|wrangler/i, "build/watch source must remain server-neutral");

assert.doesNotMatch(viewer, /setInterval|__dev_revision|ssg-output-refresh|caddy|wrangler/i);
assert.match(viewer, /const savedViewport = getViewport\(\)/);
assert.match(viewer, /setData\(data\)/);
assert.match(viewer, /setViewport\(savedViewport\)/);

assert.match(proof, /TemporaryDirectory/);
assert.match(proof, /copytree/);
assert.doesNotMatch(proof, /write_text\([^\n]*FIXTURE/);
assert.match(proof, /choices=\("wrangler", "caddy"\)/);
assert.equal((proof.match(/def run_browser_proof\(/g) || []).length, 1, "Wrangler and Caddy must share one browser assertion implementation");
assert.match(proof, /"file-server"/);
assert.match(proof, /"--root"/);
assert.match(proof, /"--listen"/);
assert.match(proof, /DEFAULT_CADDY_VERSION = "v2\.11\.3"/);
assert.match(proof, /"caddyOwnsWatchOrBuild": False/);
assert.match(proof, /\["node", str\(BUILD_SCRIPT\), "--dev", "--watch"\]/);
assert.match(proof, /report_name = "report\.json" if args\.server == "wrangler" else "caddy-report\.json"/);
assert.match(proof, /screenshot_name = "after-two-refreshes\.png" if args\.server == "wrangler" else "caddy-after-two-refreshes\.png"/);

const expectedRelevantPaths = [
  ".github/workflows/a2ui-adapter-artifacts.yml",
  "package.json",
  "packages/a2ui-adapter-artifacts/dev/ssg-output-refresh.js",
  "packages/a2ui-adapter-artifacts/scripts/build-ssg-hot-refresh-proof.mjs",
  "tests/check-ssg-hot-refresh-viewport.py",
  "tests/check-ssg-hot-refresh-yagni.mjs",
  "tests/fixtures/ssg-hot-refresh-viewport/**",
];
const relevantMatch = workflow.match(/relevant='([^']+)'/);
assert.ok(relevantMatch, "the workflow must expose one auditable relevant-path expression");
const relevantPattern = new RegExp(relevantMatch[1]);
for (const relevantPath of expectedRelevantPaths) {
  const example = relevantPath.endsWith("/**") ? `${relevantPath.slice(0, -3)}/content/scene.json` : relevantPath;
  assert.equal(relevantPattern.test(example), true, `heavy proof must select ${example}`);
}
for (const unrelatedPath of [
  "README.md",
  "docs/editor-to-queue-to-ui-boundary.md",
  "packages/core-port/src/index.mjs",
  "packages/ui-receipts/receipt.v1.json",
  "tests/check-purpose-atlas.mjs",
]) {
  assert.equal(relevantPattern.test(unrelatedPath), false, `heavy proof must skip unrelated path ${unrelatedPath}`);
}
assert.match(workflow, /- name: Run complete UI checks\n\s+run: npm run check/);
assert.match(workflow, /- name: Select heavy SSG server proof scope/);
assert.match(workflow, /id:\s*ssg_proof_scope/);
assert.match(workflow, /select_proof "manual-dispatch"/);
assert.match(workflow, /select_proof "missing-comparison-base"/);
assert.match(workflow, /select_proof "comparison-fetch-failed"/);
assert.match(workflow, /select_proof "comparison-base-unresolved"/);
assert.match(workflow, /select_proof "comparison-diff-failed"/);
assert.match(workflow, /reason=unrelated-paths/);
assert.match(workflow, /- name: Install pinned Caddy proof server\n\s+if: steps\.ssg_proof_scope\.outputs\.run == 'true'/);
assert.match(workflow, /- name: Prove SSG hot refresh viewport with selected servers\n\s+if: steps\.ssg_proof_scope\.outputs\.run == 'true'/);
assert.match(workflow, /if: \$\{\{ always\(\) && steps\.ssg_proof_scope\.outputs\.run == 'true' \}\}/);
assert.equal((workflow.match(/--server wrangler/g) || []).length, 1, "Wrangler heavy proof must have one execution surface");
assert.equal((workflow.match(/--server caddy/g) || []).length, 1, "Caddy heavy proof must have one execution surface");
assert.doesNotMatch(workflow, /paths-filter|dorny\/|schedule:/i, "path scoping must add no action or schedule");

assert.equal(findNamed(root, "Caddyfile").length, 0, "a Caddyfile is unnecessary for the file-server proof");
assert.doesNotMatch(readme, /\b(?:supports?|works with)\s+(?:any|all|arbitrary)\b/i, "README must not claim arbitrary development-server support");
assert.match(readme, /Wrangler `4\.112\.0` and Caddy `v2\.11\.3`/);
assert.match(readme, /second server proof, not a second independent product consumer/);
assert.match(readme, /heavy server proofs run only/);
assert.match(readme, /no independent workflow or schedule/);
assert.match(read(".gitignore"), /packages\/a2ui-adapter-artifacts\/\.generated\//);
assert.match(read(".gitignore"), /tests\/fixtures\/ssg-hot-refresh-viewport\/dist\//);

console.log(JSON.stringify({
  status: "ssg-hot-refresh-yagni-guard-pass",
  workflowCount: workflows.length,
  publicExportAdded: false,
  sharedPackageAdded: false,
  genericServerAbstractionAdded: false,
  provenServers: ["wrangler@4.112.0", "caddy@v2.11.3"],
  heavyProofMode: "relevant-paths-or-manual",
  unrelatedPathSkipProven: true,
  forbiddenRuntimeAdded: false,
}, null, 2));

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function findNamed(directory, target, found = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", ".generated"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) findNamed(absolute, target, found);
    else if (entry.name === target) found.push(absolute);
  }
  return found;
}
