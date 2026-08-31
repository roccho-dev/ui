import assert from "node:assert/strict";
import { canonicalJson, sha256Hex } from "../packages/url-module/src/index.mjs";
import {
  ARTIFACT_INVOCATION_CODEC_ID,
  ARTIFACT_INVOCATION_CODEC_VERSION,
  ARTIFACT_INVOCATION_REFERENCE_SCHEMA,
  compileArtifactInvocationReference,
  createArtifactInvocationIdentity,
  decodeArtifactInvocationReference,
  verifyArtifactInvocationProof,
  verifyArtifactInvocationReference,
} from "../packages/artifact-invocation/src/index.mjs";

const D = character => `sha256:${character.repeat(64)}`;
const tests = [];
const test = (name, run) => tests.push({ name, run });
const rejects = async (run, pattern) => assert.rejects(run, pattern);
const digestValue = async value => `sha256:${await sha256Hex(canonicalJson(value))}`;

const state = Object.freeze({ nodes: Object.freeze([{ id: "decision:1", title: "Publish" }]), relations: Object.freeze([]) });
const baseRequest = Object.freeze({
  constraints: Object.freeze({ allowedRuntimes: Object.freeze(["browser"]), noUpload: true }),
  expects: Object.freeze(["semantic-map-render-receipt/1"]),
  id: "decision.publish",
  inputs: Object.freeze([Object.freeze({ id: "state", mediaType: "application/json", schema: "semantic-state/1", source: Object.freeze({ kind: "inline", value: state }) })]),
  intent: "render.semantic-map",
  schema: "artifact-invocation/2",
});
const base = Object.freeze({
  capability: Object.freeze({ engineDigest: D("3"), id: "render.semantic-map", version: "1" }),
  codec: Object.freeze({ digest: D("4"), id: ARTIFACT_INVOCATION_CODEC_ID, version: ARTIFACT_INVOCATION_CODEC_VERSION }),
  profile: Object.freeze({ digest: D("2"), id: "semantic-map.public", version: "1" }),
  projection: Object.freeze({ intent: "render.semantic-map", version: "1" }),
  request: baseRequest,
  runtime: Object.freeze({ id: "artifact-shell", kernelDigest: D("1"), path: "./index.html", version: "2" }),
  semantic: Object.freeze({ digest: D("0"), id: "decision.publish" }),
});
const change = (path, value) => {
  const copy = structuredClone(base);
  let target = copy;
  const segments = path.split(".");
  for (const segment of segments.slice(0, -1)) target = target[segment];
  target[segments.at(-1)] = value;
  return copy;
};
const proofFor = async (record, semanticOutputDigest = D("9")) => Object.freeze({
  observedAt: "2026-09-01T00:00:00Z",
  semanticOutputDigest,
  outcome: Object.freeze({
    result: Object.freeze({ outputs: Object.freeze([{ contract: "semantic-map-render-receipt/1", value: Object.freeze({ digest: semanticOutputDigest }) }]), status: "PASS" }),
    receipt: Object.freeze({
      authority: false,
      capability: Object.freeze({ engine: Object.freeze({ digest: record.identity.capability.engineDigest }), id: record.identity.capability.id, version: record.identity.capability.version }),
      inputs: Object.freeze(record.request.inputs.map(input => Object.freeze({ id: input.id, sha256: input.digest ?? D("8") }))),
      request: Object.freeze({ digest: record.requestDigest, id: record.invocationId }),
      runtime: Object.freeze({ build: Object.freeze({ digest: record.identity.runtime.kernelDigest, id: record.identity.runtime.id, version: record.identity.runtime.version }) }),
    }),
  }),
});

test("same_exact_tuple_is_byte_identical", async () => {
  const one = await compileArtifactInvocationReference(base);
  const two = await compileArtifactInvocationReference(structuredClone(base));
  assert.equal(canonicalJson(one), canonicalJson(two));
  assert.equal(one.reference, two.reference);
});
test("semantic_change_creates_new_version", async () => {
  const one = await compileArtifactInvocationReference(base);
  const two = await compileArtifactInvocationReference(change("semantic.digest", D("a")));
  assert.notEqual(one.invocationId, two.invocationId);
  assert.notEqual(one.reference, two.reference);
});
test("profile_change_creates_new_version_without_changing_state_identity", async () => {
  const one = await compileArtifactInvocationReference(base);
  const two = await compileArtifactInvocationReference(change("profile.digest", D("b")));
  assert.equal(one.identity.semantic.digest, two.identity.semantic.digest);
  assert.notEqual(one.invocationId, two.invocationId);
});
test("kernel_change_creates_new_version", async () => {
  assert.notEqual((await compileArtifactInvocationReference(base)).invocationId, (await compileArtifactInvocationReference(change("runtime.kernelDigest", D("c")))).invocationId);
});
test("capability_change_creates_new_version", async () => {
  assert.notEqual((await compileArtifactInvocationReference(base)).reference, (await compileArtifactInvocationReference(change("capability.engineDigest", D("d")))).reference);
});
test("schema_or_codec_change_creates_new_version", async () => {
  const one = await compileArtifactInvocationReference(base);
  const two = await compileArtifactInvocationReference(change("codec.digest", D("e")));
  assert.notEqual(one.invocationId, two.invocationId);
  assert.equal(one.request.schema, "artifact-invocation/2");
});
test("projection_intent_change_creates_new_version", async () => {
  const changed = change("projection.intent", "render.a2ui");
  changed.request.intent = "render.a2ui";
  const one = await compileArtifactInvocationReference(base);
  const two = await compileArtifactInvocationReference(changed);
  assert.notEqual(one.reference, two.reference);
});
test("provider_origin_is_not_part_of_invocation_identity", async () => {
  const record = await compileArtifactInvocationReference(base);
  assert.equal(new URL(record.reference, "https://one.example/releases/r1/").hash, new URL(record.reference, "https://two.example/releases/r1/").hash);
  assert.equal(record.reference.startsWith("./"), true);
  assert.equal(record.reference.includes("example"), false);
});
test("mutable_latest_is_rejected_for_canonical_reference", async () => {
  await rejects(() => compileArtifactInvocationReference(change("runtime.path", "./latest/index.html")), /mutable segment/u);
  await rejects(() => compileArtifactInvocationReference(change("runtime.version", "latest")), /mutable/u);
});
test("inline_roundtrip_is_canonical", async () => {
  const record = await compileArtifactInvocationReference(base);
  const decoded = await decodeArtifactInvocationReference(record.reference);
  assert.equal(canonicalJson(decoded.request), canonicalJson(record.request));
  assert.equal((await verifyArtifactInvocationReference(record)).reference, record.reference);
});
test("external_input_requires_immutable_relative_ref_and_digest", async () => {
  const withoutDigest = structuredClone(base);
  withoutDigest.request.inputs[0].source = { kind: "url", href: "./state/data.json" };
  await rejects(() => compileArtifactInvocationReference(withoutDigest), /requires digest/u);
  const absolute = structuredClone(withoutDigest);
  absolute.request.inputs[0].digest = D("8");
  absolute.request.inputs[0].source.href = "https://provider.example/state.json";
  await rejects(() => compileArtifactInvocationReference(absolute), /Release-root-relative/u);
});
test("inline_external_semantic_output_parity", async () => {
  const external = structuredClone(base);
  external.request.inputs[0] = { ...external.request.inputs[0], digest: await digestValue(state), source: { kind: "url", href: "./state/immutable.json" } };
  const inlineRecord = await compileArtifactInvocationReference(base);
  const externalRecord = await compileArtifactInvocationReference(external);
  assert.equal(inlineRecord.identity.semantic.digest, externalRecord.identity.semantic.digest);
  assert.notEqual(inlineRecord.invocationId, externalRecord.invocationId);
  assert.equal(externalRecord.transport, "external");
});
test("fresh_browser_reports_exact_expected_identities", async () => {
  const record = await compileArtifactInvocationReference(base);
  const observation = await verifyArtifactInvocationProof({ expectedSemanticOutputDigest: D("9"), proof: await proofFor(record), record });
  assert.equal(observation.result, "PASS");
  assert.equal(observation.invocationId, record.invocationId);
});
test("refresh_and_second_context_reproduce_output", async () => {
  const record = await compileArtifactInvocationReference(base);
  const first = await verifyArtifactInvocationProof({ expectedSemanticOutputDigest: D("9"), proof: await proofFor(record), record });
  const second = await verifyArtifactInvocationProof({ expectedSemanticOutputDigest: D("9"), proof: await proofFor(record), record });
  assert.equal(canonicalJson(first), canonicalJson(second));
});
test("secret_or_credential_bearing_url_is_rejected", async () => {
  const external = structuredClone(base);
  external.request.inputs[0] = { ...external.request.inputs[0], digest: D("8"), source: { kind: "url", href: "./state.json?token=secret" } };
  await rejects(() => compileArtifactInvocationReference(external), /query or fragment|secret-bearing/u);
  await rejects(() => compileArtifactInvocationReference(change("runtime.path", "./index.html?access_token=secret")), /query or fragment|secret-bearing/u);
});
test("redirect_or_digest_mismatch_fails_before_render", async () => {
  const inline = structuredClone(base);
  inline.request.inputs[0].digest = D("f");
  await rejects(() => compileArtifactInvocationReference(inline), /digest mismatch/u);
  const external = structuredClone(base);
  external.request.inputs[0] = { ...external.request.inputs[0], digest: D("8"), source: { kind: "url", href: "https://redirect.example/state.json" } };
  await rejects(() => compileArtifactInvocationReference(external), /Release-root-relative/u);
});
test("partial_or_empty_render_cannot_report_success", async () => {
  const record = await compileArtifactInvocationReference(base);
  const proof = structuredClone(await proofFor(record));
  proof.outcome.result.outputs = [];
  await rejects(() => verifyArtifactInvocationProof({ expectedSemanticOutputDigest: D("9"), proof, record }), /must contain semantic output/u);
});
test("no_second_codec_runtime_or_request_model_is_added", async () => {
  const record = await compileArtifactInvocationReference(base);
  assert.equal(record.schema, ARTIFACT_INVOCATION_REFERENCE_SCHEMA);
  assert.equal(record.identity.codec.id, "url-module");
  assert.equal(record.request.schema, "artifact-invocation/2");
  assert.equal(record.identity.runtime.id, "artifact-shell");
  assert.equal((await createArtifactInvocationIdentity(base)).codec.version, "1");
});

const failures = [];
for (const { name, run } of tests) {
  try { await run(); }
  catch (error) { failures.push(`${name}: ${error.message}`); }
}
if (failures.length > 0) throw new Error(`version-fixed-invocation checks failed (${failures.length}/${tests.length})\n${failures.join("\n")}`);
console.log(`version-fixed-invocation-checks-pass assertions=${tests.length}`);
