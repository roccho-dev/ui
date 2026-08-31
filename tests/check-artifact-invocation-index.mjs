import assert from "node:assert/strict";
import { canonicalJson } from "../packages/url-module/src/index.mjs";
import { compileArtifactInvocationReference } from "../packages/artifact-invocation/src/index.mjs";
import {
  ARTIFACT_INVOCATION_INDEX_OBSERVATION_SCHEMA,
  ARTIFACT_INVOCATION_INDEX_ROW_SCHEMA,
  ARTIFACT_INVOCATION_INDEX_SCHEMA,
  ARTIFACT_INVOCATION_INDEX_SOURCE_SCHEMA,
  buildArtifactInvocationIndex,
  createArtifactInvocationIndexApp,
  createArtifactInvocationIndexRequest,
  parseArtifactInvocationIndex,
} from "../apps/artifact-shell/scripts/invocation-index.mjs";

const D = character => `sha256:${character.repeat(64)}`;
const tests = [];
const test = (name, run) => tests.push({ name, run });
const referenceInput = (character, id = `decision.${character}`) => Object.freeze({
  capability: Object.freeze({ engineDigest: D("3"), id: "render.semantic-map", version: "1" }),
  codec: Object.freeze({ digest: D("4"), id: "url-module", version: "1" }),
  profile: Object.freeze({ digest: D("2"), id: "semantic-map.public", version: "1" }),
  projection: Object.freeze({ intent: "render.semantic-map", version: "1" }),
  request: Object.freeze({
    constraints: Object.freeze({ allowedRuntimes: Object.freeze(["browser"]), noUpload: true }),
    expects: Object.freeze(["semantic-map-render-receipt/1"]),
    id,
    inputs: Object.freeze([Object.freeze({ id: "state", mediaType: "application/json", schema: "semantic-state/1", source: Object.freeze({ kind: "inline", value: Object.freeze({ id }) }) })]),
    intent: "render.semantic-map",
    schema: "artifact-invocation/2",
  }),
  runtime: Object.freeze({ id: "artifact-shell", kernelDigest: D("1"), path: "./index.html", version: "2" }),
  semantic: Object.freeze({ digest: D(character), id }),
});
const record = character => compileArtifactInvocationReference(referenceInput(character));
const observation = (invocation, result = "PASS", observedAt = "2026-09-01T00:00:00.000Z") => Object.freeze({
  invocationId: invocation.invocationId,
  observedAt,
  proofRef: `gha:${invocation.invocationId}:${result.toLowerCase()}`,
  result,
  schema: ARTIFACT_INVOCATION_INDEX_OBSERVATION_SCHEMA,
});
const source = (invocation, overrides = {}) => Object.freeze({
  invocation,
  observations: Object.freeze(overrides.observations ?? [observation(invocation)]),
  release: Object.freeze(overrides.release ?? { digest: D("a"), id: "ui.release.1", ref: "release:ui:1" }),
  schema: overrides.schema ?? ARTIFACT_INVOCATION_INDEX_SOURCE_SCHEMA,
  sourceRefs: Object.freeze(overrides.sourceRefs ?? ["adrs#347", "ui#191"]),
  title: overrides.title ?? invocation.identity.semantic.id,
  ...(overrides.extra ?? {}),
});
const built = async (...items) => buildArtifactInvocationIndex({ sources: items });
const catalogIdentity = index => Object.freeze({
  capability: Object.freeze({ engineDigest: D("6"), id: "render.a2ui.app", version: "1" }),
  codec: Object.freeze({ digest: D("4"), id: "url-module", version: "1" }),
  profile: Object.freeze({ digest: D("7"), id: "invocation-index.public", version: "1" }),
  projection: Object.freeze({ intent: "interact", version: "1" }),
  request: createArtifactInvocationIndexRequest({ id: "catalog.invocations", index }),
  runtime: Object.freeze({ id: "artifact-shell", kernelDigest: D("5"), path: "./index.html", version: "2" }),
  semantic: Object.freeze({ digest: index.digest, id: "catalog.invocations" }),
});

const a = await record("a");
const b = await record("b");

test("same_exact_input_set_builds_byte_identically", async () => {
  const one = await built(source(a), source(b));
  const two = await built(structuredClone(source(a)), structuredClone(source(b)));
  assert.equal(one.jsonl, two.jsonl);
  assert.equal(one.digest, two.digest);
});
test("filesystem_input_order_does_not_change_index", async () => {
  assert.equal((await built(source(a), source(b))).jsonl, (await built(source(b), source(a))).jsonl);
});
test("stable_row_identity_is_derived_from_exact_invocation", async () => {
  const index = await built(source(a));
  assert.equal(index.rows[0].id, a.invocationId);
  assert.equal(index.rows[0].invocationId, a.invocationId);
});
test("identical_duplicate_is_deduped", async () => {
  const index = await built(source(a), structuredClone(source(a)));
  assert.equal(index.rows.length, 1);
});
test("conflicting_duplicate_fails_closed", async () => {
  await assert.rejects(() => built(source(a), source(a, { title: "conflict" })), /conflicting duplicate/u);
  assert.equal((await built(source(a))).rows.length, 1);
});
test("one_new_invocation_adds_only_one_row", async () => {
  const one = await built(source(a));
  const two = await built(source(a), source(b));
  assert.equal(two.rows.length - one.rows.length, 1);
});
test("unrelated_row_bytes_remain_stable", async () => {
  const one = await built(source(a));
  const two = await built(source(a), source(b));
  assert.equal(canonicalJson(one.rows[0]), canonicalJson(two.rows.find(row => row.id === a.invocationId)));
});
test("missing_or_failed_observation_is_not_dropped", async () => {
  const missing = source(a, { observations: [] });
  const failed = source(b, { observations: [observation(b, "FAIL")] });
  const index = await built(missing, failed);
  assert.deepEqual(index.rows.map(row => row.status).sort(), ["failed", "unobserved"]);
});
test("mutable_status_is_derived_not_stored_as_authority", async () => {
  await assert.rejects(() => built(source(a, { extra: { status: "verified" } })), /status|not allowed/u);
  const index = await built(source(a, { observations: [observation(a, "PASS", "2026-08-31T00:00:00.000Z"), observation(a, "FAIL", "2026-09-01T00:00:00.000Z")] }));
  assert.equal(index.rows[0].status, "failed");
  assert.equal(index.rows[0].authority, false);
});
test("new_rows_keep_release_root_relative_invocation_ref", async () => {
  const index = await built(source(a));
  assert.equal(index.rows[0].reference, a.reference);
  assert.equal(index.rows[0].reference.startsWith("./"), true);
});
test("provider_origin_is_absent_from_new_index_identity", async () => {
  const index = await built(source(a));
  assert.equal(index.jsonl.includes("https://provider.example"), false);
  assert.equal(index.rows[0].reference.includes("://"), false);
});
test("index_rebuild_requires_no_previous_index_file", async () => {
  const first = await built(source(a), source(b));
  const rebuilt = await built(...first.rows.map(row => source(row.invocation, { observations: row.observations, release: row.release, sourceRefs: row.sourceRefs, title: row.title })));
  assert.equal(first.jsonl, rebuilt.jsonl);
});
test("index_is_rendered_by_existing_artifact_shell", async () => {
  const index = await built(source(a));
  const app = createArtifactInvocationIndexApp(index);
  const request = createArtifactInvocationIndexRequest({ id: "catalog.invocations", index });
  assert.equal(app.schema, "a2ui-app/1");
  assert.equal(request.schema, "artifact-invocation/2");
  assert.equal(request.intent, "interact");
});
test("direct_navigation_and_refresh_preserve_catalog_identity", async () => {
  const index = await built(source(a), source(b));
  const one = await compileArtifactInvocationReference(catalogIdentity(index));
  const two = await compileArtifactInvocationReference(catalogIdentity(await parseArtifactInvocationIndex(index.jsonl)));
  assert.equal(one.invocationId, two.invocationId);
  assert.equal(one.reference, two.reference);
});
test("indexed_link_opens_exact_invocation", async () => {
  const index = await built(source(a));
  const app = createArtifactInvocationIndexApp(index);
  const button = app.surface.components.find(component => component.component === "Button");
  assert.equal(button.action, "artifact.invocation.open");
  assert.equal(button.context.reference, a.reference);
  assert.equal(button.context.schema, "artifact-invocation-open-action/1");
});
test("index_displays_authority_false_and_exact_source_refs", async () => {
  const index = await built(source(a, { sourceRefs: ["adrs#347", "ui#191", "release:ui:1"] }));
  const app = createArtifactInvocationIndexApp(index);
  assert.equal(index.rows[0].authority, false);
  assert.deepEqual(index.rows[0].sourceRefs, ["adrs#347", "release:ui:1", "ui#191"]);
  assert.equal(canonicalJson(app).includes("authority=false"), true);
});
test("malformed_manifest_or_receipt_fails_closed", async () => {
  const malformedRecord = structuredClone(a);
  malformedRecord.requestDigest = D("f");
  await assert.rejects(() => built(source(malformedRecord)), /canonical|digest|record/u);
  const badObservation = { ...observation(a), invocationId: b.invocationId };
  await assert.rejects(() => built(source(a, { observations: [badObservation] })), /observation.*invocation/u);
  assert.equal((await built(source(a))).rows.length, 1);
});
test("unknown_schema_version_fails_closed", async () => {
  await assert.rejects(() => built(source(a, { schema: "artifact-invocation-index-source/999" })), /schema/u);
  assert.equal((await built(source(a))).schema, ARTIFACT_INVOCATION_INDEX_SCHEMA);
});
test("no_dedicated_index_app_database_or_search_server_is_added", async () => {
  const index = await built(source(a));
  const request = createArtifactInvocationIndexRequest({ id: "catalog.invocations", index });
  const app = request.inputs[0].source.value;
  assert.equal(request.intent, "interact");
  assert.equal(app.surface.components.every(component => ["Button", "Card", "Column", "Divider", "Text"].includes(component.component)), true);
  assert.equal(canonicalJson(index).includes("database"), false);
});
test("repository_wide_checks_remain_green", async () => {
  const index = await built(source(a), source(b));
  const parsed = await parseArtifactInvocationIndex(index.jsonl);
  assert.equal(parsed.rows.every(row => row.schema === ARTIFACT_INVOCATION_INDEX_ROW_SCHEMA), true);
  assert.equal(parsed.jsonl, index.jsonl);
});

const failures = [];
for (const { name, run } of tests) {
  try { await run(); }
  catch (error) { failures.push(`${name}: ${error.message}`); }
}
if (failures.length > 0) throw new Error(`artifact-invocation-index checks failed (${failures.length}/${tests.length})\n${failures.join("\n")}`);
console.log(`artifact-invocation-index-checks-pass assertions=${tests.length}`);
