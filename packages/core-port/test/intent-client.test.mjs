import assert from "node:assert/strict";
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
  SEMANTIC_INTENT_RESULT_SCHEMA,
  SEMANTIC_INTENT_SCHEMA,
  createSemanticIntentSubmission,
  parseSemanticIntentResult,
  submitSemanticIntent,
} = client;

const source = await readFile(new URL("../src/intent-client.mjs", import.meta.url), "utf8");
assert.doesNotMatch(source, /(?:from|import)\s*["']node:/u, "browser module imports no Node builtin");

const submission = createSemanticIntentSubmission(
  {
    topic_id: "ui-198",
    body: "Record the minimal UI boundary.",
    topic_title: "Minimal semantic intent UI",
    target_ref: { kind: "component", id: "ui-198" },
  },
  { idFactory: () => "intent-001" },
);

assert.deepEqual(submission.intent, {
  schema: SEMANTIC_INTENT_SCHEMA,
  intent_id: "intent-001",
  topic_id: "ui-198",
  kind: "record",
  body: "Record the minimal UI boundary.",
  topic_title: "Minimal semantic intent UI",
  target_ref: { kind: "component", id: "ui-198" },
});
assert.equal(
  submission.requestBody,
  '{"schema":"semantic-intent.v1","intent_id":"intent-001","topic_id":"ui-198","kind":"record","body":"Record the minimal UI boundary.","topic_title":"Minimal semantic intent UI","target_ref":{"kind":"component","id":"ui-198"}}',
  "prepared bytes are exact and deterministic",
);
assert.ok(Object.isFrozen(submission));
assert.ok(Object.isFrozen(submission.intent));
assert.ok(Object.isFrozen(submission.intent.target_ref));

assert.throws(
  () => createSemanticIntentSubmission({ topic_id: "ui-198", body: "x", repository: "roccho-dev/ui" }),
  /unknown field: repository/u,
);
assert.throws(
  () => createSemanticIntentSubmission({ topic_id: "ui-198", body: "x", target_ref: { kind: "component", id: "ui-198", path: "/tmp" } }),
  /unknown field: path/u,
);
assert.throws(
  () => createSemanticIntentSubmission({ topic_id: "ui-198", body: "x", endpoint: "https:\/\/example.test" }),
  /unknown field: endpoint/u,
);

const calls = [];
const validFetch = async (url, options) => {
  calls.push({ url, options });
  return {
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? "application/json; charset=utf-8" : null) },
    json: async () => ({
      schema: SEMANTIC_INTENT_RESULT_SCHEMA,
      intent_id: "intent-001",
      local_state: "accepted",
      github_state: "pending",
      receipt_id: "receipt-001",
    }),
  };
};

const first = await submitSemanticIntent(submission, { fetchImpl: validFetch });
const retry = await submitSemanticIntent(submission, { fetchImpl: validFetch });
assert.deepEqual(first, {
  transport_state: "received",
  schema: SEMANTIC_INTENT_RESULT_SCHEMA,
  intent_id: "intent-001",
  local_state: "accepted",
  github_state: "pending",
  receipt_id: "receipt-001",
});
assert.deepEqual(retry, first);
assert.equal(calls.length, 2);
for (const call of calls) {
  assert.equal(call.url, SEMANTIC_INTENT_ENDPOINT);
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.body, submission.requestBody, "retry reuses exact request bytes");
  assert.equal(call.options.credentials, "same-origin");
  assert.equal(call.options.redirect, "error");
  assert.equal(call.options.cache, "no-store");
}

const ambiguous = await submitSemanticIntent(submission, {
  fetchImpl: async () => {
    throw new Error("connection closed after request write");
  },
});
assert.deepEqual(ambiguous, {
  transport_state: "unknown",
  intent_id: "intent-001",
  local_state: "unknown",
  github_state: "unknown",
  error_code: "transport_ambiguous",
});

const wrongType = await submitSemanticIntent(submission, {
  fetchImpl: async () => ({
    headers: { get: () => "text/html" },
    json: async () => ({}),
  }),
});
assert.equal(wrongType.transport_state, "rejected");
assert.equal(wrongType.error_code, "invalid_response_content_type");
assert.equal(wrongType.local_state, "unknown");

const malformed = await submitSemanticIntent(submission, {
  fetchImpl: async () => ({
    headers: { get: () => "application/json" },
    json: async () => {
      throw new SyntaxError("bad json");
    },
  }),
});
assert.equal(malformed.error_code, "malformed_response_json");

const mismatched = await submitSemanticIntent(submission, {
  fetchImpl: async () => ({
    headers: { get: () => "application/json" },
    json: async () => ({
      schema: SEMANTIC_INTENT_RESULT_SCHEMA,
      intent_id: "intent-999",
      local_state: "accepted",
      github_state: "pending",
    }),
  }),
});
assert.equal(mismatched.error_code, "invalid_response_contract");

assert.deepEqual(
  parseSemanticIntentResult({
    schema: SEMANTIC_INTENT_RESULT_SCHEMA,
    intent_id: "intent-001",
    local_state: "accepted",
    github_state: "applied",
    issue_number: 198,
    comment_id: 5522136398,
    receipt_id: "receipt-002",
  }),
  {
    schema: SEMANTIC_INTENT_RESULT_SCHEMA,
    intent_id: "intent-001",
    local_state: "accepted",
    github_state: "applied",
    issue_number: 198,
    comment_id: 5522136398,
    receipt_id: "receipt-002",
  },
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
  () => parseSemanticIntentResult({
    schema: SEMANTIC_INTENT_RESULT_SCHEMA,
    intent_id: "intent-001",
    local_state: "accepted",
    github_state: "pending",
    accepted: true,
  }),
  /unknown field: accepted/u,
);

assert.deepEqual(LOCAL_STATES, ["accepted", "no_change", "rejected", "failed", "unknown"]);
assert.deepEqual(GITHUB_STATES, ["not_started", "pending", "applied", "unknown", "permanent_failure"]);

console.log(JSON.stringify({
  status: "semantic-intent-client-check-pass",
  endpoint: SEMANTIC_INTENT_ENDPOINT,
  requestSchema: SEMANTIC_INTENT_SCHEMA,
  resultSchema: SEMANTIC_INTENT_RESULT_SCHEMA,
  intentId: submission.intent.intent_id,
  retryBytesStable: calls[0].options.body === calls[1].options.body,
}, null, 2));
