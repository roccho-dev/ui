import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

let importFetchCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  importFetchCalls += 1;
  throw new Error("import must not call fetch");
};
const client = await import(`../src/intent-client.mjs?proof=${Date.now()}`);
globalThis.fetch = originalFetch;
assert.equal(importFetchCalls, 0, "module import has no network effect");

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

const submission = createSemanticIntentSubmission({
  topic_id: "ui-198",
  body: "Record the minimal UI boundary.",
  topic_title: "Minimal semantic intent UI",
  target_ref: { kind: "component", id: "ui-198" },
}, { idFactory: () => "intent-001" });

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
assert.ok(Object.isFrozen(submission) && Object.isFrozen(submission.intent) && Object.isFrozen(submission.intent.target_ref));

for (const [field, value] of [
  ["repository", "roccho-dev/ui"],
  ["issue_number", 198],
  ["endpoint", "https://example.test"],
]) {
  assert.throws(
    () => createSemanticIntentSubmission({ topic_id: "ui-198", body: "x", [field]: value }),
    new RegExp(`unknown field: ${field}`, "u"),
  );
}
assert.throws(
  () => createSemanticIntentSubmission({ topic_id: "ui-198", body: "x", target_ref: { kind: "component", id: "ui-198", path: "/tmp" } }),
  /unknown field: path/u,
);

const response = (payload, contentType = "application/json; charset=utf-8") => ({
  headers: { get: (name) => (name.toLowerCase() === "content-type" ? contentType : null) },
  json: async () => payload,
});
const pendingPayload = {
  schema: SEMANTIC_INTENT_RESULT_SCHEMA,
  intent_id: "intent-001",
  local_state: "accepted",
  github_state: "pending",
  receipt_id: "receipt-001",
};
const calls = [];
const validFetch = async (url, options) => {
  calls.push({ url, options });
  return response(pendingPayload);
};

const first = await submitSemanticIntent(submission, { fetchImpl: validFetch });
const retry = await submitSemanticIntent(submission, { fetchImpl: validFetch });
assert.deepEqual(first, { transport_state: "received", ...pendingPayload });
assert.deepEqual(retry, first);
assert.equal(calls.length, 2);
for (const { url, options } of calls) {
  assert.equal(url, SEMANTIC_INTENT_ENDPOINT);
  assert.deepEqual(
    { method: options.method, body: options.body, credentials: options.credentials, redirect: options.redirect, cache: options.cache },
    { method: "POST", body: submission.requestBody, credentials: "same-origin", redirect: "error", cache: "no-store" },
  );
}
await assert.rejects(
  submitSemanticIntent({ ...submission, requestBody: `${submission.requestBody} ` }, { fetchImpl: validFetch }),
  /exact canonical intent bytes/u,
);
assert.equal(calls.length, 2, "tampered prepared bytes cause no request");

const ambiguous = await submitSemanticIntent(submission, { fetchImpl: async () => { throw new Error("closed"); } });
assert.deepEqual(ambiguous, {
  transport_state: "unknown",
  intent_id: "intent-001",
  local_state: "unknown",
  github_state: "unknown",
  error_code: "transport_ambiguous",
});

const wrongType = await submitSemanticIntent(submission, { fetchImpl: async () => response({}, "text/html") });
assert.deepEqual(wrongType, {
  transport_state: "rejected",
  intent_id: "intent-001",
  local_state: "unknown",
  github_state: "unknown",
  error_code: "invalid_response_content_type",
});
const malformed = await submitSemanticIntent(submission, {
  fetchImpl: async () => ({ headers: { get: () => "application/json" }, json: async () => { throw new SyntaxError("bad json"); } }),
});
assert.equal(malformed.error_code, "malformed_response_json");
const mismatched = await submitSemanticIntent(submission, {
  fetchImpl: async () => response({ ...pendingPayload, intent_id: "intent-999" }),
});
assert.equal(mismatched.error_code, "invalid_response_contract");

const applied = {
  schema: SEMANTIC_INTENT_RESULT_SCHEMA,
  intent_id: "intent-001",
  local_state: "accepted",
  github_state: "applied",
  issue_number: 198,
  comment_id: 5522136398,
  receipt_id: "receipt-002",
};
assert.deepEqual(parseSemanticIntentResult(applied), applied);
for (const invalid of [
  { ...applied, issue_number: undefined, comment_id: undefined },
  { ...pendingPayload, local_state: "saved" },
  { ...pendingPayload, accepted: true },
]) {
  assert.throws(() => parseSemanticIntentResult(invalid));
}

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
