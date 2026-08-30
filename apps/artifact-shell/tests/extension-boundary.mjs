import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createArtifactInvocationRuntime } from "../../../packages/artifact-invocation/src/index.mjs";
import { buildRegistry } from "../scripts/build-registry.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "../..");
let assertions = 0;
const equal = (...args) => { assert.equal(...args); assertions += 1; };
const deepEqual = (...args) => { assert.deepEqual(...args); assertions += 1; };

const digestFiles = async roots => {
  const files = [];
  const walk = async target => {
    const stat = await fs.stat(target);
    if (stat.isFile()) { files.push(target); return; }
    for (const entry of (await fs.readdir(target)).sort()) await walk(path.join(target, entry));
  };
  for (const root of roots) await walk(root);
  const digest = createHash("sha256");
  for (const file of files.sort()) {
    digest.update(path.relative(repoRoot, file));
    digest.update("\0");
    digest.update(await fs.readFile(file));
    digest.update("\0");
  }
  return digest.digest("hex");
};

const coreRoots = [
  path.join(repoRoot, "packages", "artifact-invocation", "src"),
  path.join(appRoot, "src"),
  path.join(appRoot, "index.html"),
];
const baseCapabilityCount = (await fs.readdir(path.join(appRoot, "capabilities"), { withFileTypes: true })).filter(entry => entry.isDirectory()).length;
const coreBefore = await digestFiles(coreRoots);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-shell-extension-"));
const capabilitiesRoot = path.join(temporary, "capabilities");
const generated = path.join(temporary, "generated", "capability-registry.mjs");
await fs.cp(path.join(appRoot, "capabilities"), capabilitiesRoot, { recursive: true });
const echoRoot = path.join(capabilitiesRoot, "echo-text");
await fs.mkdir(path.join(echoRoot, "fixtures"), { recursive: true });
await fs.writeFile(path.join(echoRoot, "manifest.json"), `${JSON.stringify({
  schema: "artifact-capability-declaration/2",
  id: "echo.text",
  version: "1",
  engine: { kind: "esm", file: "engine.mjs" },
  accepts: { intents: ["echo"], minInputs: 1, maxInputs: 1, shapes: ["blob"], mediaTypes: ["text/plain"], schemas: ["*"] },
  limits: { maxInputBytes: 1024, maxTotalBytes: 1024, maxEntries: 1, maxEngineBytes: 32768 },
  provides: ["echo.text"],
  produces: ["echo/1"],
  requires: { features: [], runtimes: ["browser", "node"], services: [] },
  fixtures: { pass: ["fixtures/pass.json"], destructive: ["fixtures/destructive.json"] },
}, null, 2)}\n`);
await fs.writeFile(path.join(echoRoot, "engine.mjs"), `export const capability=Object.freeze({id:"echo.text",version:"1",async run({input,invocation}){const id=invocation.inputs[0].id;return Object.freeze({diagnostics:Object.freeze([]),outputs:Object.freeze([{contract:"echo/1",value:Object.freeze({text:input.readText(id)})}]),status:"PASS"});}});\n`);

const echoRequest = {
  schema: "artifact-invocation/2",
  id: "request.echo.text",
  intent: "echo",
  inputs: [{ id: "payload", mediaType: "text/plain", schema: "text/1", source: { kind: "inline", value: "added without core edit" } }],
  constraints: { allowedRuntimes: ["browser", "node"], noUpload: true },
  expects: ["echo/1"],
};
await fs.writeFile(path.join(echoRoot, "fixtures", "pass.json"), `${JSON.stringify({ schema: "artifact-capability-fixture/2", id: "echo-text.pass", kind: "pass", runtimes: ["browser", "node"], request: echoRequest, expected: { status: "PASS", outputContracts: ["echo/1"] } }, null, 2)}\n`);
await fs.writeFile(path.join(echoRoot, "fixtures", "destructive.json"), `${JSON.stringify({ schema: "artifact-capability-fixture/2", id: "echo-text.destructive", kind: "destructive", runtimes: ["browser", "node"], request: { ...echoRequest, id: "request.echo.text.destructive", inputs: [{ ...echoRequest.inputs[0], digest: `sha256:${"0".repeat(64)}` }] }, expected: { status: "INCONCLUSIVE", outputContracts: [] } }, null, 2)}\n`);

const build = await buildRegistry({ capabilitiesRoot, check: false, output: generated });
equal(build.manifests.length, baseCapabilityCount + 1);
const registry = await import(`${pathToFileURL(generated).href}?proof=${Date.now()}`);
equal(registry.TRUSTED_ARTIFACT_CAPABILITIES.length, baseCapabilityCount + 1);
equal(registry.TRUSTED_ARTIFACT_CAPABILITIES.some(item => item.id === "echo.text"), true);

const engineRequests = [];
const runtime = await createArtifactInvocationRuntime({
  engineBaseUrl: registry.ARTIFACT_CAPABILITY_REGISTRY_BASE_URL,
  environment: { runtime: "browser", features: ["crypto.subtle"] },
  fetchEngine: async href => {
    engineRequests.push(href);
    return new Response(await fs.readFile(fileURLToPath(href)), { headers: { "content-type": "text/javascript" } });
  },
  manifests: registry.TRUSTED_ARTIFACT_CAPABILITIES,
  runtimeBuild: Object.freeze({ digest: registry.ARTIFACT_SHELL_BUILD.digest, id: registry.ARTIFACT_SHELL_BUILD.id, version: registry.ARTIFACT_SHELL_BUILD.version }),
});
const outcome = await runtime.execute({ request: { ...echoRequest } });
equal(outcome.result.status, "PASS");
equal(outcome.result.outputs[0].value.text, "added without core edit");
deepEqual(runtime.loadedCapabilities(), ["echo.text@1"]);
equal(engineRequests.length, 1);
equal(new URL(engineRequests[0]).pathname.endsWith("/capabilities/echo-text/engine.mjs"), true);

const coreAfter = await digestFiles(coreRoots);
equal(coreAfter, coreBefore);
await fs.rm(temporary, { recursive: true, force: true });

console.log(JSON.stringify({ schema: "check-receipt/1", checkId: "ui.artifact-shell.extension-boundary", ownerRepo: "ui", lane: "repo", kind: "mutation", status: "PASS", assertions }));
