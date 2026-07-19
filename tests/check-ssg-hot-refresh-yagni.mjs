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

for (const [relative, text] of Object.entries(texts)) {
  for (const forbidden of ["EventSource", "new WebSocket", "vite", "serviceWorker", "location.reload", "hot-module", "hmr"]) {
    assert.equal(text.toLowerCase().includes(forbidden.toLowerCase()), false, `${relative} contains forbidden scope: ${forbidden}`);
  }
}

for (const forbiddenMeaning of ["viewport", "camera", "svg", "lod", "repoMap", "geoMap", "setData", "setViewport"]) {
  assert.equal(poller.includes(forbiddenMeaning), false, `poller owns forbidden UI meaning: ${forbiddenMeaning}`);
}
assert.match(poller, /intervalMs = 500/);
assert.match(poller, /cache: "no-store"/);
assert.match(poller, /inFlight/);
assert.match(poller, /await refresh\(nextRevision\)/);

assert.match(build, /atomicWrite\(path\.join\(out, "generated", "scene\.json"\), sceneText\)/);
assert.match(build, /Deliberately last/);
assert.ok(build.indexOf("Deliberately last") > build.indexOf("generated\", \"scene.json"), "revision marker must follow generated output");
assert.match(build, /if \(dev\)/);
assert.match(build, /await rm\(pollingClient, \{ force: true \}\)/);
assert.match(build, /await rm\(revisionFile, \{ force: true \}\)/);
assert.doesNotMatch(build, /generatedAt|new Date\(/);
assert.doesNotMatch(viewer, /setInterval|__dev_revision|ssg-output-refresh/);
assert.match(viewer, /const savedViewport = getViewport\(\)/);
assert.match(viewer, /setData\(data\)/);
assert.match(viewer, /setViewport\(savedViewport\)/);

assert.match(proof, /TemporaryDirectory/);
assert.match(proof, /copytree/);
assert.doesNotMatch(proof, /write_text\([^\n]*FIXTURE/);
assert.match(read(".gitignore"), /packages\/a2ui-adapter-artifacts\/\.generated\//);
assert.match(read(".gitignore"), /tests\/fixtures\/ssg-hot-refresh-viewport\/dist\//);

console.log(JSON.stringify({
  status: "ssg-hot-refresh-yagni-guard-pass",
  workflowCount: workflows.length,
  publicExportAdded: false,
  sharedPackageAdded: false,
  forbiddenRuntimeAdded: false,
}, null, 2));

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}
