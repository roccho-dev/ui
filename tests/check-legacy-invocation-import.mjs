import assert from "node:assert/strict";
import { compileArtifactInvocationReference } from "../packages/artifact-invocation/src/index.mjs";
import { canonicalJson, createUrlModuleUrl, sha256Hex } from "../packages/url-module/src/index.mjs";
import {
  buildArtifactInvocationIndex,
  createArtifactInvocationIndexApp,
} from "../apps/artifact-shell/scripts/invocation-index.mjs";
import {
  LEGACY_INVOCATION_IMPORT_SCHEMA,
  LEGACY_INVOCATION_OBSERVATION_SCHEMA,
  LEGACY_INVOCATION_RECORD_SCHEMA,
  LEGACY_INVOCATION_SEED_ENTRY_SCHEMA,
  LEGACY_INVOCATION_SEED_SCHEMA,
  importLegacyInvocationSeed,
} from "../apps/artifact-shell/scripts/legacy-invocation-import.mjs";

const D = character => `sha256:${character.repeat(64)}`;
const digestValue = async value => `sha256:${await sha256Hex(canonicalJson(value))}`;
const tests = [];
const test = (name, run) => tests.push({ name, run });

const state = Object.freeze({ nodes: Object.freeze([{ id: "decision:legacy", title: "Legacy decision" }]), relations: Object.freeze([]) });
const stateDigest = await digestValue(state);
const legacyRequest = Object.freeze({
  constraints: Object.freeze({ allowedRuntimes: Object.freeze(["browser"]), noUpload: true }),
  expects: Object.freeze(["semantic-map-render-receipt/1"]),
  id: "legacy.decision",
  inputs: Object.freeze([Object.freeze({ id: "state", mediaType: "application/json", schema: "semantic-state/1", source: Object.freeze({ kind: "inline", value: state }) })]),
  intent: "render.semantic-map",
  schema: "artifact-invocation/2",
});
const exactUrl = await createUrlModuleUrl({
  base: "https://archive.example/releases/2026-08-31/index.html",
  fragment: "invoke",
  value: legacyRequest,
});
const mutableUrl = await createUrlModuleUrl({
  base: "https://archive.example/releases/latest/index.html",
  fragment: "invoke",
  value: legacyRequest,
});
const observation = (overrides = {}) => Object.freeze({
  complete: overrides.complete ?? true,
  observedAt: overrides.observedAt ?? "2026-09-01T00:00:00.000Z",
  proofRef: overrides.proofRef ?? "gha:legacy-browser-proof:1",
  result: overrides.result ?? "PASS",
  schema: LEGACY_INVOCATION_OBSERVATION_SCHEMA,
  ...(overrides.semanticDigest === null ? {} : { semanticDigest: overrides.semanticDigest ?? stateDigest }),
});
const exactEvidence = Object.freeze({
  codec: Object.freeze({ digest: D("c"), id: "url-module", kind: "supported", version: "1" }),
  projection: Object.freeze({ intent: "render.semantic-map", version: "1" }),
  runtime: Object.freeze({ digest: D("b"), id: "artifact-shell", path: "/releases/2026-08-31/index.html", version: "2" }),
  schema: "artifact-invocation/2",
  state: Object.freeze({ digest: stateDigest, inputId: "state" }),
});
const exactNormalizationInput = Object.freeze({
  capability: Object.freeze({ engineDigest: D("3"), id: "render.semantic-map", version: "1" }),
  codec: Object.freeze({ digest: D("4"), id: "url-module", version: "1" }),
  profile: Object.freeze({ digest: D("2"), id: "semantic-map.public", version: "1" }),
  projection: Object.freeze({ intent: "render.semantic-map", version: "1" }),
  request: legacyRequest,
  runtime: Object.freeze({ id: "artifact-shell", kernelDigest: D("1"), path: "./index.html", version: "2" }),
  semantic: Object.freeze({ digest: stateDigest, id: "decision.legacy" }),
});
const entry = (overrides = {}) => Object.freeze({
  evidence: overrides.evidence ?? exactEvidence,
  observations: Object.freeze(overrides.observations ?? [observation()]),
  originalUrl: overrides.originalUrl ?? exactUrl,
  schema: LEGACY_INVOCATION_SEED_ENTRY_SCHEMA,
  sourceRefs: Object.freeze(overrides.sourceRefs ?? ["adrs#347", "legacy-release:1"]),
  title: overrides.title ?? "Legacy decision",
  ...(overrides.normalization ? { normalization: overrides.normalization } : {}),
  ...(overrides.privateEvidenceRef ? { privateEvidenceRef: overrides.privateEvidenceRef } : {}),
  ...(overrides.extra ?? {}),
});
const seed = entries => Object.freeze({ entries: Object.freeze(entries), schema: LEGACY_INVOCATION_SEED_SCHEMA });
const run = async entries => {
  const value = seed(entries);
  return importLegacyInvocationSeed({ seed: value, seedDigest: await digestValue(value) });
};
const unsupportedEvidence = Object.freeze({ codec: Object.freeze({ id: "legacy-opaque", kind: "unsupported" }) });
const ambiguousEvidence = Object.freeze({ codec: Object.freeze({ candidates: Object.freeze(["codec-a", "codec-b"]), kind: "ambiguous" }) });

test("bounded_seed_digest_is_required", async () => {
  await assert.rejects(() => importLegacyInvocationSeed({ seed: seed([entry()]) }), /seedDigest.*required|seed digest/u);
  await assert.rejects(() => importLegacyInvocationSeed({ seed: seed([entry()]), seedDigest: D("0") }), /seed digest mismatch/u);
});
test("unbounded_discovery_is_not_performed", async () => {
  let called = false;
  const value = seed([entry()]);
  await assert.rejects(() => importLegacyInvocationSeed({ discover: () => { called = true; }, seed: value, seedDigest: await digestValue(value) }), /discover.*not allowed/u);
  assert.equal(called, false);
});
test("original_url_bytes_are_preserved", async () => {
  const imported = await run([entry()]);
  assert.equal(imported.records[0].originalUrl, exactUrl);
  assert.equal(imported.records[0].originalUrlDigest, await digestValue(exactUrl));
});
test("supported_exact_legacy_url_is_classified_exact_only_after_browser_pass", async () => {
  assert.equal((await run([entry({ observations: [] })])).records[0].classification, "unknown");
  assert.equal((await run([entry()])).records[0].classification, "exact");
});
test("mutable_runtime_is_classified_state_pinned", async () => {
  const evidence = structuredClone(exactEvidence);
  evidence.runtime.path = "/releases/latest/index.html";
  evidence.runtime.version = "latest";
  const imported = await run([entry({ evidence, originalUrl: mutableUrl })]);
  assert.equal(imported.records[0].classification, "state-pinned");
  assert.equal(imported.records[0].stateDigest, stateDigest);
});
test("unsupported_or_ambiguous_codec_is_classified_unknown", async () => {
  const imported = await run([
    entry({ evidence: unsupportedEvidence, originalUrl: "https://archive.example/legacy#opaque", observations: [] }),
    entry({ evidence: ambiguousEvidence, originalUrl: "https://archive.example/legacy#ambiguous", observations: [], title: "Ambiguous" }),
  ]);
  assert.deepEqual(imported.records.map(record => record.classification), ["unknown", "unknown"]);
});
test("direct_replay_failure_is_classified_broken", async () => {
  const imported = await run([entry({ observations: [observation({ result: "FAIL", semanticDigest: null })] })]);
  assert.equal(imported.records[0].classification, "broken");
});
test("http_200_empty_or_partial_render_is_not_exact", async () => {
  const imported = await run([entry({ observations: [observation({ complete: false, semanticDigest: null })] })]);
  assert.equal(imported.records[0].classification, "broken");
});
test("decode_does_not_invent_missing_semantic_fields", async () => {
  const imported = await run([entry({ evidence: unsupportedEvidence, originalUrl: "https://archive.example/legacy#opaque", observations: [] })]);
  assert.equal(Object.hasOwn(imported.records[0], "stateDigest"), false);
  assert.equal(Object.hasOwn(imported.records[0], "decodedRequest"), false);
});
test("broken_and_unknown_rows_are_not_dropped_from_index", async () => {
  const imported = await run([
    entry({ observations: [observation({ result: "FAIL", semanticDigest: null })] }),
    entry({ evidence: unsupportedEvidence, originalUrl: "https://archive.example/legacy#opaque", observations: [], title: "Unknown" }),
  ]);
  const index = await buildArtifactInvocationIndex({ legacySources: imported.records, sources: [] });
  assert.deepEqual(index.rows.map(row => row.status).sort(), ["broken", "unknown"]);
  assert.equal(index.rows.length, 2);
});
test("stored_mutable_status_cannot_override_latest_observation", async () => {
  await assert.rejects(() => run([entry({ extra: { status: "exact" } })]), /status.*not allowed/u);
  const imported = await run([entry({ observations: [
    observation({ observedAt: "2026-08-31T00:00:00.000Z" }),
    observation({ observedAt: "2026-09-01T00:00:00.000Z", result: "FAIL", semanticDigest: null }),
  ] })]);
  assert.equal(imported.records[0].classification, "broken");
});
test("normalization_creates_new_invocation_identity", async () => {
  const imported = await run([entry({ normalization: { input: exactNormalizationInput, relation: "equivalent_state" } })]);
  const record = imported.records[0];
  assert.notEqual(record.normalized.invocation.invocationId, record.id);
  assert.equal(record.normalized.invocation.reference.startsWith("./"), true);
});
test("normalization_does_not_replace_original_url", async () => {
  const imported = await run([entry({ normalization: { input: exactNormalizationInput, relation: "equivalent_state" } })]);
  assert.equal(imported.records[0].originalUrl, exactUrl);
  assert.notEqual(imported.records[0].normalized.invocation.reference, exactUrl);
});
test("equivalent_state_requires_equal_canonical_state_digest", async () => {
  const imported = await run([entry({ normalization: { input: exactNormalizationInput, relation: "equivalent_state" } })]);
  assert.equal(imported.records[0].normalized.relation, "equivalent_state");
  assert.equal(imported.records[0].normalized.invocation.identity.semantic.digest, stateDigest);
});
test("different_state_digest_cannot_be_marked_equivalent", async () => {
  const different = structuredClone(exactNormalizationInput);
  different.semantic.digest = D("f");
  await assert.rejects(() => run([entry({ normalization: { input: different, relation: "equivalent_state" } })]), /equivalent_state.*digest/u);
});
test("same_seed_and_observations_build_byte_identically", async () => {
  const one = await run([entry()]);
  const two = await run([structuredClone(entry())]);
  assert.equal(one.jsonl, two.jsonl);
  assert.equal(one.digest, two.digest);
  assert.equal(one.schema, LEGACY_INVOCATION_IMPORT_SCHEMA);
});
test("duplicate_original_url_is_deduped_only_when_evidence_matches", async () => {
  const imported = await run([entry(), structuredClone(entry())]);
  assert.equal(imported.records.length, 1);
});
test("conflicting_duplicate_evidence_fails_closed", async () => {
  await assert.rejects(() => run([entry(), entry({ title: "Conflicting title" })]), /conflicting duplicate/u);
});
test("secret_bearing_legacy_url_is_quarantined_not_exposed", async () => {
  const parsed = new URL(exactUrl);
  parsed.searchParams.set("token", "super-secret-value");
  const imported = await run([entry({ originalUrl: parsed.href, privateEvidenceRef: "private:legacy-secret:1" })]);
  const record = imported.records[0];
  assert.equal(record.classification, "unknown");
  assert.equal(Object.hasOwn(record, "originalUrl"), false);
  assert.equal(record.quarantine.reason, "credential-bearing-url");
  assert.equal(imported.jsonl.includes("super-secret-value"), false);
});
test("no_second_codec_crawler_database_or_repair_service_is_added", async () => {
  const value = seed([entry()]);
  await assert.rejects(() => importLegacyInvocationSeed({ crawler: true, seed: value, seedDigest: await digestValue(value) }), /crawler.*not allowed/u);
  const imported = await run([entry()]);
  const index = await buildArtifactInvocationIndex({ legacySources: imported.records, sources: [] });
  const app = createArtifactInvocationIndexApp(index);
  assert.equal(imported.records[0].schema, LEGACY_INVOCATION_RECORD_SCHEMA);
  assert.equal(app.surface.components.every(component => ["Button", "Card", "Column", "Divider", "Text"].includes(component.component)), true);
  assert.equal(canonicalJson(imported).includes("database"), false);
  const normalized = await compileArtifactInvocationReference(exactNormalizationInput);
  assert.equal(normalized.identity.codec.id, "url-module");
});

const failures = [];
for (const { name, run } of tests) {
  try { await run(); }
  catch (error) { failures.push(`${name}: ${error.message}`); }
}
if (failures.length > 0) throw new Error(`legacy-invocation-import checks failed (${failures.length}/${tests.length})\n${failures.join("\n")}`);
console.log(`legacy-invocation-import-checks-pass assertions=${tests.length}`);
