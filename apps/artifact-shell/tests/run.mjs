import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createArtifactInvocationRuntime } from "../../../packages/artifact-invocation/src/index.mjs";
import {
  ARTIFACT_CAPABILITY_REGISTRY_BASE_URL,
  ARTIFACT_SHELL_BUILD,
  TRUSTED_ARTIFACT_CAPABILITIES,
} from "../generated/capability-registry.mjs";
import {
  collectLocalBindings,
  detectBrowserEnvironment,
  renderLocalBindingInputs,
} from "../src/shell.mjs";
import { createArtifactShellServices } from "../src/services.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "../..");
let assertions = 0;
const equal = (...args) => { assert.equal(...args); assertions += 1; };
const deepEqual = (...args) => { assert.deepEqual(...args); assertions += 1; };
const ok = (...args) => { assert.ok(...args); assertions += 1; };

const readJson = async file => JSON.parse(await fs.readFile(file, "utf8"));
const request = name => readJson(path.join(appRoot, "fixtures", "requests", `${name}.json`));
const fixtureBytes = await fs.readFile(path.join(appRoot, "fixtures", "data", "inspect.json"));

const makeElement = tagName => {
  const listeners = new Map();
  return {
    attributes: new Map(),
    children: [],
    dataset: {},
    files: [],
    hidden: false,
    tagName,
    textContent: "",
    type: "",
    value: "",
    addEventListener(name, listener) { listeners.set(name, listener); },
    append(...values) { this.children.push(...values); },
    dispatch(name, event = { preventDefault() {} }) { return listeners.get(name)?.(event); },
    replaceChildren(...values) { this.children = [...values]; },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
  };
};
const document = { createElement: makeElement };
const surfaceMount = makeElement("surface");
const engineRequests = [];
const inputRequests = [];
const engineFetch = async href => {
  engineRequests.push(href);
  const bytes = await fs.readFile(fileURLToPath(href));
  return new Response(bytes, { status: 200, headers: { "content-type": "text/javascript" } });
};
const inputFetch = async href => {
  inputRequests.push(href);
  return new Response(fixtureBytes, { status: 200, headers: { "content-type": "application/json", "content-length": String(fixtureBytes.byteLength) } });
};
const runtime = await createArtifactInvocationRuntime({
  engineBaseUrl: ARTIFACT_CAPABILITY_REGISTRY_BASE_URL,
  environment: { runtime: "browser", features: ["crypto.subtle", "dom", "fetch", "file"] },
  fetchEngine: engineFetch,
  fetchInput: inputFetch,
  manifests: TRUSTED_ARTIFACT_CAPABILITIES,
  runtimeBuild: Object.freeze({ digest: ARTIFACT_SHELL_BUILD.digest, id: ARTIFACT_SHELL_BUILD.id, version: ARTIFACT_SHELL_BUILD.version }),
  services: createArtifactShellServices({ document, eventTarget: { dispatchEvent: () => true }, surfaceMount }),
});

const inline = await runtime.execute({ request: await request("inspect-json-inline") });
equal(inline.result.status, "PASS");
equal(inline.result.outputs[0].contract, "json-inspection/1");
deepEqual(inline.result.outputs[0].value.keys, ["items", "title"]);
equal(inline.receipt.authority, false);
equal(inline.receipt.capability.id, "inspect.json");
equal(inline.receipt.capability.engine.digest, TRUSTED_ARTIFACT_CAPABILITIES.find(item => item.id === "inspect.json").engine.digest);
deepEqual(runtime.loadedCapabilities(), ["inspect.json@1"]);
equal(engineRequests.length, 1);

const url = await runtime.execute({ request: await request("inspect-json-url") });
equal(url.result.status, "PASS");
equal(url.receipt.inputs[0].sha256, inline.receipt.inputs[0].sha256);
equal(inputRequests.length, 1);
equal(engineRequests.length, 1);

const localFile = Object.freeze({
  name: "inspect.json",
  size: fixtureBytes.byteLength,
  type: "application/json",
  async arrayBuffer() { return fixtureBytes.buffer.slice(fixtureBytes.byteOffset, fixtureBytes.byteOffset + fixtureBytes.byteLength); },
});
const file = await runtime.execute({ bindings: { "payload-file": localFile }, request: await request("inspect-json-file") });
equal(file.result.status, "PASS");
equal(file.receipt.inputs[0].sha256, inline.receipt.inputs[0].sha256);
equal(inputRequests.length, 1);
equal(engineRequests.length, 1);

const a2ui = await runtime.execute({ request: await request("render-a2ui-inline") });
equal(a2ui.result.status, "PASS");
equal(a2ui.result.outputs[0].contract, "a2ui-render-receipt/1");
equal(a2ui.result.outputs[0].value.componentCount, 4);
equal(surfaceMount.children[0].attributes.get("data-a2ui-component"), "Column");
deepEqual(runtime.loadedCapabilities(), ["inspect.json@1", "render.a2ui@1"]);
equal(engineRequests.length, 2);

const unsupported = await runtime.execute({ request: await request("unsupported") });
equal(unsupported.result.status, "UNSUPPORTED");
equal(unsupported.receipt.capability, null);
equal(engineRequests.length, 2);

const fakeScope = {
  crypto: { subtle: {} },
  document,
  fetch() {},
  File: class File {},
  Worker: class Worker {},
  WebAssembly: {},
};
deepEqual(detectBrowserEnvironment(fakeScope).features, ["crypto.subtle", "dom", "fetch", "file", "wasm", "worker"]);

const localContainer = makeElement("div");
const localRequest = await request("inspect-json-file");
const controls = renderLocalBindingInputs({ container: localContainer, document, request: localRequest });
equal(controls.size, 1);
equal(localContainer.hidden, false);
const control = controls.get("payload-file");
control.files = [localFile];
equal(collectLocalBindings(controls)["payload-file"], localFile);

for (const manifest of TRUSTED_ARTIFACT_CAPABILITIES) {
  const enginePath = fileURLToPath(new URL(manifest.engine.href, ARTIFACT_CAPABILITY_REGISTRY_BASE_URL));
  const bytes = await fs.readFile(enginePath);
  equal(manifest.engine.bytes, bytes.byteLength);
  equal(manifest.engine.digest, `sha256:${createHash("sha256").update(bytes).digest("hex")}`);
}

equal(ARTIFACT_SHELL_BUILD.schema, "artifact-runtime-build/1");
equal(ARTIFACT_SHELL_BUILD.id, "artifact-shell");
equal(ARTIFACT_SHELL_BUILD.files.length > 10, true);
const buildBody = { files: ARTIFACT_SHELL_BUILD.files, id: ARTIFACT_SHELL_BUILD.id, schema: ARTIFACT_SHELL_BUILD.schema, version: ARTIFACT_SHELL_BUILD.version };
equal(ARTIFACT_SHELL_BUILD.digest, `sha256:${createHash("sha256").update((await import("../../../packages/url-module/src/index.mjs")).canonicalJson(buildBody)).digest("hex")}`);
for (const descriptor of ARTIFACT_SHELL_BUILD.files) {
  const bytes = await fs.readFile(path.join(repoRoot, descriptor.path));
  equal(descriptor.bytes, bytes.byteLength);
  equal(descriptor.sha256, `sha256:${createHash("sha256").update(bytes).digest("hex")}`);
}
const registrySource = await fs.readFile(path.join(appRoot, "generated", "capability-registry.mjs"), "utf8");
ok(registrySource.includes("Generated by apps/artifact-shell/scripts/build-registry.mjs"));
const shellSource = await fs.readFile(path.join(appRoot, "src", "shell.mjs"), "utf8");
for (const forbidden of ["inspect.json", "render.a2ui", "capabilities/inspect-json", "capabilities/render-a2ui"]) equal(shellSource.includes(forbidden), false);
const runtimeSource = await fs.readFile(path.join(repoRoot, "packages", "artifact-invocation", "src", "runtime.mjs"), "utf8");
for (const forbidden of ["inspect.json", "render.a2ui"]) equal(runtimeSource.includes(forbidden), false);

const manifest = await readJson(path.join(repoRoot, "packages", "artifact-invocation", "check-manifest.json"));
equal(manifest.schema, "check-manifest/2");
equal(manifest.ownerRepo, "ui");
equal(manifest.checks.length, 6);
equal(new Set(manifest.checks.map(item => item.id)).size, 6);
equal(manifest.checks.every(item => item.resultSchema === "check-receipt/1"), true);
equal(manifest.checks.every(item => item.status === "active"), true);
const ids = new Set(manifest.checks.map(item => item.id));
equal(manifest.checks.every(item => item.deps.every(dependency => ids.has(dependency))), true);
equal(manifest.checks.every(item => Array.isArray(item.argv) && item.argv.length > 0), true);
equal(manifest.checks.every(item => Number.isSafeInteger(item.timeoutMs) && item.timeoutMs > 0), true);

const rootPackage = await readJson(path.join(repoRoot, "package.json"));
deepEqual(rootPackage.workspaces, ["packages/core-port"]);
ok(rootPackage.scripts.check.includes("check:artifact-runtime"));
equal(typeof rootPackage.scripts["proof:artifact-shell-browser"], "string");

const registryUrl = pathToFileURL(path.join(appRoot, "generated", "capability-registry.mjs")).href;
equal(ARTIFACT_CAPABILITY_REGISTRY_BASE_URL, registryUrl);

console.log(JSON.stringify({
  schema: "check-receipt/1",
  checkId: "ui.artifact-shell.unit",
  ownerRepo: "ui",
  lane: "repo",
  kind: "normal",
  status: "PASS",
  assertions,
}));
