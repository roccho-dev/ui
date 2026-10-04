import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  ARTIFACT_CAPABILITY_MANIFEST_SCHEMA,
  ARTIFACT_INVOCATION_RECEIPT_SCHEMA,
  ARTIFACT_CAPABILITY_FIXTURE_SCHEMA,
  createArtifactCapabilityRegistry,
  createArtifactInvocationRuntime,
  resolveArtifactInputs,
  validateArtifactCapabilityDeclaration,
  validateArtifactInvocation,
  validateArtifactCapabilityFixture,
} from "../src/index.mjs";

let assertions = 0;
const equal = (...args) => { assert.equal(...args); assertions += 1; };
const deepEqual = (...args) => { assert.deepEqual(...args); assertions += 1; };
const throws = (...args) => { assert.throws(...args); assertions += 1; };
const rejects = async (...args) => { await assert.rejects(...args); assertions += 1; };
const sha = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const engineSource = `export const capability=Object.freeze({id:"inspect.json",version:"1",async run({input,invocation}){const value=input.readJson(invocation.inputs[0].id);return Object.freeze({status:"PASS",diagnostics:Object.freeze([]),outputs:Object.freeze([{contract:"inspection/1",value:Object.freeze({hasSource:Object.hasOwn(invocation.inputs[0],"source"),keys:Object.keys(value).sort()})}])});}});`;
const engineBytes = new TextEncoder().encode(engineSource);
const limits = Object.freeze({ maxEngineBytes: 32_768, maxEntries: 16, maxInputBytes: 1_024, maxTotalBytes: 2_048 });
const runtimeBuild = Object.freeze({ id: "test-shell", version: "1", digest: `sha256:${"1".repeat(64)}` });
const manifest = Object.freeze({
  schema: ARTIFACT_CAPABILITY_MANIFEST_SCHEMA,
  id: "inspect.json",
  version: "1",
  engine: Object.freeze({ kind: "esm", href: "../capabilities/inspect-json/engine.mjs", bytes: engineBytes.byteLength, digest: sha(engineBytes) }),
  accepts: Object.freeze({ intents: Object.freeze(["inspect"]), minInputs: 1, maxInputs: 1, shapes: Object.freeze(["blob"]), mediaTypes: Object.freeze(["application/json"]), schemas: Object.freeze(["*"]) }),
  limits,
  provides: Object.freeze(["inspect.json"]),
  produces: Object.freeze(["inspection/1"]),
  requires: Object.freeze({ features: Object.freeze([]), runtimes: Object.freeze(["browser", "node"]), services: Object.freeze([]) }),
  fixtures: Object.freeze({ pass: Object.freeze(["fixtures/pass.json"]), destructive: Object.freeze(["fixtures/destructive.json"]) }),
});
const baseRequest = Object.freeze({
  schema: "artifact-invocation/2",
  id: "request.inspect.inline",
  intent: "inspect",
  inputs: Object.freeze([Object.freeze({ id: "payload", mediaType: "application/json", schema: "example/1", source: Object.freeze({ kind: "inline", value: Object.freeze({ z: 2, a: 1 }) }) })]),
  constraints: Object.freeze({ allowedRuntimes: Object.freeze(["browser", "node"]), noUpload: true }),
  expects: Object.freeze(["inspection/1"]),
});

const validated = validateArtifactInvocation(baseRequest);
equal(validated.schema, "artifact-invocation/2");
equal(validated.constraints.noUpload, true);
throws(() => validateArtifactInvocation({ ...baseRequest, constraints: { allowedRuntimes: ["browser"], noUpload: false } }), /noUpload must be true/u);
throws(() => validateArtifactInvocation({ ...baseRequest, engine: "https://evil.test/x.mjs" }), /request.engine is not allowed/u);
throws(() => validateArtifactInvocation({ ...baseRequest, inputs: [{ ...baseRequest.inputs[0], source: { kind: "url", href: "http://plain.test/x" } }] }), /relative or https/u);

const declaration = validateArtifactCapabilityDeclaration({
  ...manifest,
  schema: "artifact-capability-declaration/2",
  engine: { kind: "esm", file: "engine.mjs" },
});
equal(declaration.engine.file, "engine.mjs");
throws(() => validateArtifactCapabilityDeclaration({ ...declaration, engine: { kind: "esm", file: "../engine.mjs" } }), /local .mjs/u);
const passFixture = validateArtifactCapabilityFixture({ schema: ARTIFACT_CAPABILITY_FIXTURE_SCHEMA, id: "inspect.pass", kind: "pass", runtimes: ["browser", "node"], request: baseRequest, expected: { status: "PASS", outputContracts: ["inspection/1"] } });
equal(passFixture.kind, "pass");
throws(() => validateArtifactCapabilityFixture({ ...passFixture, kind: "destructive", expected: { status: "PASS", outputContracts: [] } }), /must not expect PASS/u);

const registry = createArtifactCapabilityRegistry([manifest]);
for (const source of [
  { kind: "inline", value: { a: 1 } },
  { kind: "url", href: "./data.json" },
  { kind: "file", binding: "payload" },
]) {
  const result = registry.resolve({ ...baseRequest, id: `request.${source.kind}`, inputs: [{ ...baseRequest.inputs[0], source }] });
  equal(result.kind, "selected");
  equal(result.manifest.id, "inspect.json");
}
const unsupported = registry.resolve({ ...baseRequest, id: "request.unknown", intent: "unknown" });
equal(unsupported.kind, "unsupported");
const twin = Object.freeze({ ...manifest, id: "inspect.twin", engine: Object.freeze({ ...manifest.engine, href: "../capabilities/twin/engine.mjs" }), provides: Object.freeze(["inspect.twin"]) });
const ambiguous = createArtifactCapabilityRegistry([manifest, twin]).resolve(baseRequest);
equal(ambiguous.kind, "ambiguous");

const canonical = new TextEncoder().encode('{"a":1,"z":2}');
const file = { name: "data.json", type: "application/json", size: canonical.byteLength, async arrayBuffer() { return canonical.buffer.slice(canonical.byteOffset, canonical.byteOffset + canonical.byteLength); } };
const inlineResolved = await resolveArtifactInputs({ limits, request: baseRequest });
const urlResolved = await resolveArtifactInputs({
  fetchInput: async () => new Response(canonical, { status: 200, headers: { "content-type": "application/json" } }),
  limits,
  request: { ...baseRequest, id: "request.url", inputs: [{ ...baseRequest.inputs[0], source: { kind: "url", href: "./data.json" } }] },
});
const encodedHeaderResolved = await resolveArtifactInputs({
  fetchInput: async () => new Response(canonical, { status: 200, headers: { "content-type": "application/json", "content-encoding": "gzip", "content-length": "1" } }),
  limits,
  request: { ...baseRequest, id: "request.encoded", inputs: [{ ...baseRequest.inputs[0], source: { kind: "url", href: "./data.json" } }] },
});
const referenceResolved = await resolveArtifactInputs({
  fetchInput: async (_href, options) => {
    equal(options.redirect, "error");
    equal(options.credentials, "omit");
    return new Response(canonical, { status: 200, headers: { "content-type": "application/json", "content-length": String(canonical.byteLength) } });
  },
  limits,
  request: {
    ...baseRequest,
    id: "request.reference",
    inputs: [{
      ...baseRequest.inputs[0],
      source: {
        kind: "reference",
        reference: {
          schema: "artifact-reference/1",
          href: "https://artifact.test/data.json",
          mediaType: "application/json",
          bytes: canonical.byteLength,
          sha256: sha(canonical).slice("sha256:".length),
        },
      },
    }],
  },
});
equal(referenceResolved.evidence[0].sha256, inlineResolved.evidence[0].sha256);
equal(encodedHeaderResolved.evidence[0].bytes, canonical.byteLength);
const fileResolved = await resolveArtifactInputs({
  bindings: { payload: file },
  limits,
  request: { ...baseRequest, id: "request.file", inputs: [{ ...baseRequest.inputs[0], source: { kind: "file", binding: "payload" } }] },
});
await rejects(() => resolveArtifactInputs({
  limits,
  request: { ...baseRequest, id: "request.digest-mismatch", inputs: [{ ...baseRequest.inputs[0], digest: `sha256:${"0".repeat(64)}` }] },
}), /digest mismatch/u);
await rejects(() => resolveArtifactInputs({
  limits,
  request: { ...baseRequest, id: "request.missing-file", inputs: [{ ...baseRequest.inputs[0], source: { kind: "file", binding: "missing" } }] },
}), /binding is missing/u);
equal(inlineResolved.evidence[0].sha256, urlResolved.evidence[0].sha256);
equal(urlResolved.evidence[0].sha256, fileResolved.evidence[0].sha256);
equal(Object.hasOwn(inlineResolved.input.invocation.inputs[0], "source"), false);
equal(inlineResolved.input.invocation.inputs[0].sourceKind, "inline");
equal(inlineResolved.input.invocation.inputs[0].mutable, true);
equal(urlResolved.input.invocation.inputs[0].sourceKind, "url");
equal(urlResolved.input.invocation.inputs[0].mutable, false);
equal(fileResolved.input.invocation.inputs[0].sourceKind, "file");
equal(fileResolved.input.invocation.inputs[0].mutable, false);
const immutableInlineResolved = await resolveArtifactInputs({
  limits,
  request: { ...baseRequest, id: "request.inline-immutable", inputs: [{ ...baseRequest.inputs[0], digest: inlineResolved.evidence[0].sha256 }] },
});
equal(immutableInlineResolved.input.invocation.inputs[0].sourceKind, "inline");
equal(immutableInlineResolved.input.invocation.inputs[0].mutable, false);
const firstCopy = inlineResolved.input.readBytes("payload");
firstCopy[0] = 0;
equal(new TextDecoder().decode(inlineResolved.input.readBytes("payload")), '{"a":1,"z":2}');
deepEqual(inlineResolved.input.readJson("payload"), { a: 1, z: 2 });

const fileA = { name: "a.txt", webkitRelativePath: "repo/a.txt", type: "text/plain", size: 1, async arrayBuffer() { return Uint8Array.of(65).buffer; } };
const fileB = { name: "b.txt", webkitRelativePath: "repo/b.txt", type: "text/plain", size: 1, async arrayBuffer() { return Uint8Array.of(66).buffer; } };
const directoryRequest = {
  ...baseRequest,
  id: "request.directory",
  inputs: [{ id: "repo", mediaType: "application/vnd.roccho.directory", schema: "directory/1", source: { kind: "directory", binding: "repo" } }],
};
const directoryA = await resolveArtifactInputs({ bindings: { repo: [fileB, fileA] }, limits, request: directoryRequest });
const directoryB = await resolveArtifactInputs({ bindings: { repo: [fileA, fileB] }, limits, request: directoryRequest });
equal(directoryA.evidence[0].sha256, directoryB.evidence[0].sha256);
deepEqual(directoryA.input.listEntries("repo").map(entry => entry.path), ["repo/a.txt", "repo/b.txt"]);
const entryCopy = directoryA.input.readEntryBytes("repo", "repo/a.txt");
entryCopy[0] = 0;
equal(directoryA.input.readEntryBytes("repo", "repo/a.txt")[0], 65);
await rejects(() => resolveArtifactInputs({ bindings: { repo: [{ ...fileA, webkitRelativePath: "../a.txt" }] }, limits, request: directoryRequest }), /path is unsafe/u);

let engineFetches = 0;
const runtime = await createArtifactInvocationRuntime({
  engineBaseUrl: "https://shell.test/generated/capability-registry.mjs",
  environment: { runtime: "browser", features: ["crypto.subtle"] },
  fetchEngine: async href => {
    engineFetches += 1;
    equal(href, `https://shell.test/capabilities/inspect-json/engine.mjs?sha256=${manifest.engine.digest.slice("sha256:".length)}`);
    return new Response(engineBytes, { status: 200, headers: { "content-type": "text/javascript" } });
  },
  manifests: [manifest],
  runtimeBuild,
});
const events = [];
const outcome = await runtime.execute({ emit: event => events.push(event), request: baseRequest });
equal(outcome.result.status, "PASS");
deepEqual(outcome.result.outputs[0].value.keys, ["a", "z"]);
equal(outcome.result.outputs[0].value.hasSource, false);
equal(outcome.receipt.schema, ARTIFACT_INVOCATION_RECEIPT_SCHEMA);
equal(outcome.receipt.authority, false);
equal(outcome.receipt.runtime.id, "artifact-invocation-runtime");
equal(outcome.receipt.runtime.version, "2");
equal(outcome.receipt.runtime.contractDigest.startsWith("sha256:"), true);
equal(outcome.receipt.inputs[0].sha256, inlineResolved.evidence[0].sha256);
equal(outcome.receipt.capability.engine.digest, manifest.engine.digest);
equal(outcome.receipt.capability.engine.bytes, engineBytes.byteLength);
equal(engineFetches, 1);
await runtime.execute({ request: baseRequest });
equal(engineFetches, 1);
deepEqual(events.map(event => event.kind), ["resolved", "resolving-inputs", "loading-engine", "running", "completed"]);
const nodeRuntime = await createArtifactInvocationRuntime({
  engineBaseUrl: "https://shell.test/generated/capability-registry.mjs",
  environment: { runtime: "node", features: ["crypto.subtle"] },
  fetchEngine: async () => new Response(engineBytes, { status: 200, headers: { "content-type": "text/javascript" } }),
  manifests: [manifest],
  runtimeBuild,
});
const nodeOutcome = await nodeRuntime.execute({ request: baseRequest });
equal(nodeOutcome.result.status, "PASS");
equal(nodeOutcome.receipt.environment.runtime, "node");
const browserOnlyRequest = { ...baseRequest, constraints: { allowedRuntimes: ["browser"], noUpload: true } };
const nodeBlocked = await nodeRuntime.execute({ request: browserOnlyRequest });
equal(nodeBlocked.result.status, "INCONCLUSIVE");
equal(nodeBlocked.result.diagnostics[0].code, "runtime.request.disallowed");

const badDigestRuntime = await createArtifactInvocationRuntime({
  engineBaseUrl: "https://shell.test/generated/registry.mjs",
  environment: { runtime: "browser", features: ["crypto.subtle"] },
  fetchEngine: async () => new Response(new TextEncoder().encode(`${engineSource} `), { headers: { "content-type": "text/javascript" } }),
  manifests: [manifest],
  runtimeBuild,
});
const badDigest = await badDigestRuntime.execute({ request: baseRequest });
equal(badDigest.result.status, "INCONCLUSIVE");
equal(badDigest.result.diagnostics[0].code, "runtime.execution.inconclusive");
equal(badDigestRuntime.loadedCapabilities().length, 0);

const serviceManifest = Object.freeze({ ...manifest, requires: Object.freeze({ features: Object.freeze([]), runtimes: Object.freeze(["browser", "node"]), services: Object.freeze(["render"] ) }) });
let serviceEngineFetches = 0;
const missingServiceRuntime = await createArtifactInvocationRuntime({
  engineBaseUrl: "https://shell.test/generated/registry.mjs",
  environment: { runtime: "browser", features: ["crypto.subtle"] },
  fetchEngine: async () => { serviceEngineFetches += 1; return new Response(engineBytes); },
  manifests: [serviceManifest],
  runtimeBuild,
});
const missingService = await missingServiceRuntime.execute({ request: baseRequest });
equal(missingService.result.status, "INCONCLUSIVE");
equal(missingService.result.diagnostics[0].code, "runtime.service.missing");
equal(serviceEngineFetches, 0);

const missingFeatureRuntime = await createArtifactInvocationRuntime({
  engineBaseUrl: "https://shell.test/generated/registry.mjs",
  environment: { runtime: "browser", features: [] },
  fetchEngine: async () => { throw new Error("must not fetch"); },
  manifests: [manifest],
  runtimeBuild,
});
const missingFeature = await missingFeatureRuntime.execute({ request: baseRequest });
equal(missingFeature.result.status, "INCONCLUSIVE");
equal(missingFeature.result.diagnostics[0].code, "runtime.environment.missing");

const unsupportedRuntime = await createArtifactInvocationRuntime({
  engineBaseUrl: "https://shell.test/generated/registry.mjs",
  environment: { runtime: "browser", features: ["crypto.subtle"] },
  fetchEngine: async () => { throw new Error("must not fetch"); },
  manifests: [manifest],
  runtimeBuild,
});
const unsupportedOutcome = await unsupportedRuntime.execute({ request: { ...baseRequest, id: "request.none", intent: "none" } });
equal(unsupportedOutcome.result.status, "UNSUPPORTED");
equal(unsupportedOutcome.receipt.capability, null);
equal(unsupportedRuntime.loadedCapabilities().length, 0);

const tinyManifest = Object.freeze({ ...manifest, limits: Object.freeze({ ...limits, maxInputBytes: 4, maxTotalBytes: 4 }) });
let tinyFetches = 0;
const tinyRuntime = await createArtifactInvocationRuntime({
  engineBaseUrl: "https://shell.test/generated/registry.mjs",
  environment: { runtime: "browser", features: ["crypto.subtle"] },
  fetchEngine: async () => { tinyFetches += 1; return new Response(engineBytes); },
  manifests: [tinyManifest],
  runtimeBuild,
});
const tiny = await tinyRuntime.execute({ request: baseRequest });
equal(tiny.result.status, "INCONCLUSIVE");
equal(tinyFetches, 0);

console.log(JSON.stringify({ schema: "check-receipt/1", checkId: "ui.artifact-invocation.unit", ownerRepo: "ui", lane: "repo", kind: "normal", status: "PASS", assertions }));
