import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

let importFetchCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  importFetchCalls += 1;
  throw new Error("import must not call fetch");
};

const client = await import(`../src/intent-client.mjs?proof=${Date.now()}`);
assert.equal(importFetchCalls, 0, "module import has no network effect");
globalThis.fetch = originalFetch;

const {
  GITHUB_STATES,
  LOCAL_STATES,
  SEMANTIC_INTENT_ENDPOINT,
  SEMANTIC_INTENT_KIND,
  SEMANTIC_INTENT_LIMITS,
  SEMANTIC_INTENT_RESULT_SCHEMA,
  SEMANTIC_INTENT_SCHEMA,
  createSemanticIntentSubmission,
  parseSemanticIntentResult,
  submitSemanticIntent,
} = client;

const fixture = async (name) => readFile(new URL(`../fixtures/semantic-intent-v1/${name}`, import.meta.url), "utf8");
const requestFixture = await fixture("request.json");
const pendingFixture = await fixture("result-pending.json");
const appliedFixture = await fixture("result-applied.json");
const rejectedFixture = await fixture("result-rejected.json");
const permanentFailureFixture = await fixture("result-permanent-failure.json");

const source = await readFile(new URL("../src/intent-client.mjs", import.meta.url), "utf8");
assert.doesNotMatch(source, /(?:from|import)\s*["']node:/u, "browser module imports no Node builtin");

const submission = createSemanticIntentSubmission(
  {
    topic_id: "ui-198",
    body: "最小の意味論ログを記録する。",
    topic_title: "最小意味論ログ",
    target_ref: { kind: "component", id: "ui-198" },
  },
  { idFactory: () => "intent-001" },
);

assert.deepEqual(submission.intent, JSON.parse(requestFixture));
assert.equal(submission.requestBody, requestFixture, "client emits the parent-frozen request bytes");
assert.equal(Buffer.byteLength(requestFixture), 230);
assert.equal(
  createHash("sha256").update(requestFixture).digest("hex"),
  "c1ac1ac878f9f24b9bba91fcb40bcfbbc65be966c08984a4fb4dfccab6723efe",
);
assert.ok(Object.isFrozen(submission));
assert.ok(Object.isFrozen(submission.intent));
assert.ok(Object.isFrozen(submission.intent.target_ref));

assert.equal(SEMANTIC_INTENT_SCHEMA, "semantic.intent.v1");
assert.equal(SEMANTIC_INTENT_RESULT_SCHEMA, "semantic.intent.result.v1");
assert.equal(SEMANTIC_INTENT_KIND, "record");
assert.equal(SEMANTIC_INTENT_ENDPOINT, "/api/intents");
assert.deepEqual(SEMANTIC_INTENT_LIMITS, {
  identifierBytes: 128,
  targetKindBytes: 64,
  topicTitleBytes: 256,
  bodyBytes: 16_384,
  requestBytes: 32_768,
});

for (const bad of [
  { topic_id: "ui-198", body: "x", repository: "roccho-dev/ui" },
  { topic_id: "ui-198", body: "x", issue_number: 198 },
  { topic_id: "ui-198", body: "x", endpoint: "https://example.test" },
  { topic_id: "ui-198", body: "x", target_ref: { kind: "component", id: "ui-198", path: "/tmp" } },
]) {
  assert.throws(() => createSemanticIntentSubmission(bad), /unknown field/u);
}
assert.throws(
  () => createSemanticIntentSubmission({ topic_id: "ui-198", body: "x", topic_title: null }),
  /non-empty string/u,
);
assert.throws(
  () => createSemanticIntentSubmission({ topic_id: "ui-198", body: "a".repeat(16_385) }),
  /16384 UTF-8 bytes/u,
);
assert.throws(
  () => createSemanticIntentSubmission({ topic_id: "ui-198", body: "x", topic_title: "あ".repeat(86) }),
  /256 UTF-8 bytes/u,
);
assert.throws(
  () => createSemanticIntentSubmission({ topic_id: "/local/path", body: "x" }),
  /valid ASCII token/u,
);
assert.throws(
  () => createSemanticIntentSubmission({ topic_id: "ui-198", body: "\ud800" }),
  /unpaired surrogate/u,
);
assert.equal(
  createSemanticIntentSubmission(
    { topic_id: "ui/path-198", body: "x" },
    { idFactory: () => "intent/002" },
  ).intent.topic_id,
  "ui/path-198",
);

const calls = [];
const validFetch = async (url, options) => {
  calls.push({ url, options });
  return {
    headers: {
      get: (name) => (name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : null),
    },
    json: async () => JSON.parse(pendingFixture),
  };
};

const first = await submitSemanticIntent(submission, { fetchImpl: validFetch });
const retry = await submitSemanticIntent(submission, { fetchImpl: validFetch });
assert.deepEqual(first, { transport_state: "received", ...JSON.parse(pendingFixture) });
assert.deepEqual(retry, first);
assert.equal(calls.length, 2);
for (const call of calls) {
  assert.equal(call.url, SEMANTIC_INTENT_ENDPOINT);
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.body, requestFixture, "ambiguous retry reuses byte-identical request body");
  assert.equal(call.options.credentials, "same-origin");
  assert.equal(call.options.redirect, "error");
  assert.equal(call.options.cache, "no-store");
}

await assert.rejects(
  () => submitSemanticIntent(
    { intent: submission.intent, requestBody: `${requestFixture}\n` },
    { fetchImpl: validFetch },
  ),
  /exact canonical intent bytes/u,
);

const ambiguous = await submitSemanticIntent(submission, {
  fetchImpl: async () => {
    throw new Error("connection closed");
  },
});
assert.deepEqual(ambiguous, {
  transport_state: "unknown",
  intent_id: "intent-001",
  local_state: "unknown",
  github_state: "unknown",
  error_code: "transport_ambiguous",
});

for (const [response, errorCode] of [
  [
    { headers: { get: () => "text/html" }, json: async () => ({}) },
    "invalid_response_content_type",
  ],
  [
    {
      headers: { get: () => "application/json" },
      json: async () => {
        throw new SyntaxError("bad json");
      },
    },
    "malformed_response_json",
  ],
  [
    {
      headers: { get: () => "application/json" },
      json: async () => ({ ...JSON.parse(pendingFixture), intent_id: "intent-999" }),
    },
    "invalid_response_contract",
  ],
]) {
  const result = await submitSemanticIntent(submission, { fetchImpl: async () => response });
  assert.equal(result.transport_state, "rejected");
  assert.equal(result.error_code, errorCode);
  assert.equal(result.local_state, "unknown");
}

assert.deepEqual(parseSemanticIntentResult(JSON.parse(appliedFixture)), JSON.parse(appliedFixture));
assert.deepEqual(parseSemanticIntentResult(JSON.parse(rejectedFixture)), JSON.parse(rejectedFixture));
assert.deepEqual(
  parseSemanticIntentResult(JSON.parse(permanentFailureFixture)),
  JSON.parse(permanentFailureFixture),
);
assert.throws(
  () => parseSemanticIntentResult({ ...JSON.parse(appliedFixture), issue_number: undefined }),
  /positive safe integer/u,
);
assert.throws(
  () => parseSemanticIntentResult({
    schema: SEMANTIC_INTENT_RESULT_SCHEMA,
    intent_id: "intent-001",
    local_state: "accepted",
    github_state: "applied",
  }),
  /requires result.issue_number/u,
);
assert.throws(
  () => parseSemanticIntentResult({
    schema: SEMANTIC_INTENT_RESULT_SCHEMA,
    intent_id: "intent-001",
    local_state: "saved",
    github_state: "pending",
  }),
  /unsupported local_state/u,
);
assert.throws(
  () => parseSemanticIntentResult({ ...JSON.parse(pendingFixture), accepted: true }),
  /unknown field: accepted/u,
);

assert.deepEqual(LOCAL_STATES, ["accepted", "no_change", "rejected", "failed", "unknown"]);
assert.deepEqual(GITHUB_STATES, ["not_started", "pending", "applied", "unknown", "permanent_failure"]);

console.log(JSON.stringify({
  status: "semantic-intent-client-check-pass",
  endpoint: SEMANTIC_INTENT_ENDPOINT,
  requestSchema: SEMANTIC_INTENT_SCHEMA,
  resultSchema: SEMANTIC_INTENT_RESULT_SCHEMA,
  requestSha256: createHash("sha256").update(requestFixture).digest("hex"),
  retryBytesStable: calls[0].options.body === calls[1].options.body,
}, null, 2));
