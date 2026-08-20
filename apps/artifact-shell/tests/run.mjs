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
  createArtifactShell,
  detectBrowserEnvironment,
  renderLocalBindingInputs,
} from "../src/shell.mjs";
import { applyArtifactStateAction, createArtifactInvocationUrl } from "../src/invocation-action.mjs";
import { readUrlModule } from "../../../packages/url-module/src/index.mjs";
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
    click() { return listeners.get("click")?.(); },
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

const appRequest = await request("render-a2ui-app-inline");
const app = await runtime.execute({ request: appRequest });
equal(app.result.status, "PASS");
equal(app.result.outputs[0].contract, "a2ui-app-render-receipt/1");
equal(app.result.outputs[0].value.appSchema, "a2ui-app/1");
equal(surfaceMount.children[0].children[1].textContent, "0");
deepEqual(runtime.loadedCapabilities(), ["inspect.json@1", "render.a2ui.app@1", "render.a2ui@1"]);
equal(engineRequests.length, 3);

const actionDetail = Object.freeze({
  action: "artifact.state.patch",
  context: Object.freeze({
    schema: "artifact-state-action/1",
    inputId: "app",
    history: "push",
    operations: Object.freeze([{ op: "increment", path: "/state/count", by: 1 }]),
  }),
  sourceComponentId: "increment",
  surfaceId: "bidirectional-url-proof",
  version: "v0.9.1",
});
const compiled = applyArtifactStateAction({ detail: actionDetail, request: appRequest });
equal(compiled.history, "push");
equal(compiled.request.inputs[0].source.value.state.count, 1);
const compiledUrl = await createArtifactInvocationUrl({ base: "https://example.invalid/runtime/index.html?proof=1", request: compiled.request });
equal((await readUrlModule({ fragment: "invoke", input: compiledUrl })).inputs[0].source.value.state.count, 1);
assert.throws(() => applyArtifactStateAction({ detail: { ...actionDetail, context: { ...actionDetail.context, operations: [{ op: "increment", path: "/surface/rootId", by: 1 }] } }, request: appRequest }), /below \/state/); assertions += 1;

const unsupported = await runtime.execute({ request: await request("unsupported") });
equal(unsupported.result.status, "UNSUPPORTED");
equal(unsupported.receipt.capability, null);
equal(engineRequests.length, 3);

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

assert.throws(() => applyArtifactStateAction({ detail: { ...actionDetail, context: { ...actionDetail.context, operations: [{ op: "increment", path: "/state/__proto__/x", by: 1 }] } }, request: appRequest }), /segment is invalid/); assertions += 1;
assert.throws(() => applyArtifactStateAction({ detail: { ...actionDetail, context: { ...actionDetail.context, operations: [{ op: "increment", path: "/state/missing", by: 1 }] } }, request: appRequest }), /does not exist/); assertions += 1;
const digestedAppRequest = structuredClone(appRequest);
digestedAppRequest.inputs[0].digest = `sha256:${"0".repeat(64)}`;
assert.throws(() => applyArtifactStateAction({ detail: actionDetail, request: digestedAppRequest }), /must not carry an immutable digest/); assertions += 1;

const createElements = () => Object.freeze({
  form: makeElement("form"),
  localInputs: makeElement("local-inputs"),
  progress: makeElement("progress"),
  receipt: makeElement("receipt"),
  request: makeElement("request"),
  result: makeElement("result"),
  run: makeElement("run"),
  status: makeElement("status"),
  surface: makeElement("surface"),
});
const makeScope = href => {
  const listeners = new Map();
  const location = { href, origin: new URL(href).origin };
  const historyCalls = [];
  const stack = [href];
  let index = 0;
  const setLocation = nextHref => {
    location.href = String(nextHref);
    location.origin = new URL(location.href).origin;
  };
  const update = (kind, state, title, nextHref) => {
    if (kind === "push") {
      stack.splice(index + 1);
      stack.push(String(nextHref));
      index = stack.length - 1;
    } else {
      stack[index] = String(nextHref);
    }
    setLocation(stack[index]);
    historyCalls.push(Object.freeze({ href: location.href, kind, state, title }));
  };
  return {
    addEventListener(name, listener) { listeners.set(name, listener); },
    crypto: { subtle: globalThis.crypto?.subtle ?? {} },
    dispatchEvent(event) { listeners.get(event.type)?.(event); return true; },
    document,
    fetch: engineFetch,
    File: class File {},
    history: {
      back() {
        if (index === 0) return;
        index -= 1;
        setLocation(stack[index]);
        listeners.get("popstate")?.({ type: "popstate" });
      },
      pushState: (state, title, nextHref) => update("push", state, title, nextHref),
      replaceState: (state, title, nextHref) => update("replace", state, title, nextHref),
    },
    historyCalls,
    location,
    WebAssembly: {},
  };
};
const waitFor = async predicate => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("artifact-shell unit wait timed out");
};
const initialHref = await createArtifactInvocationUrl({ base: pathToFileURL(path.join(appRoot, "index.html")).href, request: appRequest });
const shellElements = createElements();
const shellScope = makeScope(initialHref);
await createArtifactShell({ elements: shellElements, scope: shellScope });
equal(shellElements.status.dataset.state, "pass");
equal(shellElements.surface.children[0].children[1].textContent, "0");
shellElements.surface.children[0].children[2].click();
await waitFor(() => shellScope.historyCalls.length === 1 && shellElements.surface.children[0]?.children[1]?.textContent === "1");
equal(shellScope.historyCalls[0].kind, "push");
const shellRestoredRequest = await readUrlModule({ fragment: "invoke", input: shellScope.location.href });
equal(shellRestoredRequest.inputs[0].source.value.state.count, 1);
equal(JSON.parse(shellElements.request.value).inputs[0].source.value.state.count, 1);
equal(JSON.parse(shellElements.result.textContent).status, "PASS");
const sharedHref = shellScope.location.href;
shellScope.history.back();
await waitFor(() => shellElements.surface.children[0]?.children[1]?.textContent === "0");
equal((await readUrlModule({ fragment: "invoke", input: shellScope.location.href })).inputs[0].source.value.state.count, 0);

const freshElements = createElements();
const freshScope = makeScope(sharedHref);
await createArtifactShell({ elements: freshElements, scope: freshScope });
equal(JSON.parse(freshElements.request.value).inputs[0].source.value.state.count, 1);
equal(freshElements.status.dataset.state, "pass");
equal(freshElements.surface.children[0].children[1].textContent, "1");

const genericActionRequest = structuredClone(await request("render-a2ui-inline"));
genericActionRequest.inputs[0].source.value.components.find(component => component.id === "root").children.push("generic");
genericActionRequest.inputs[0].source.value.components.push({ id: "generic", component: "Button", label: "Generic action", action: "customer.next", context: { value: 1 } });
const genericHref = await createArtifactInvocationUrl({ base: pathToFileURL(path.join(appRoot, "index.html")).href, request: genericActionRequest });
const genericElements = createElements();
const genericScope = makeScope(genericHref);
const observedActions = [];
genericScope.addEventListener("a2ui-client-action", event => observedActions.push(event.detail));
await createArtifactShell({ elements: genericElements, scope: genericScope });
genericElements.surface.children[0].children[2].click();
equal(observedActions.length, 1);
equal(observedActions[0].action, "customer.next");
equal(genericScope.historyCalls.length, 0);
equal(genericElements.status.dataset.state, "pass");

console.log(JSON.stringify({
  schema: "check-receipt/1",
  checkId: "ui.artifact-shell.unit",
  ownerRepo: "ui",
  lane: "repo",
  kind: "normal",
  status: "PASS",
  assertions,
}));
