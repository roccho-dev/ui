const OWN = Object.prototype.hasOwnProperty;
const UTF8 = new TextEncoder();

export const SEMANTIC_INTENT_SCHEMA = "semantic.intent.v1";
export const SEMANTIC_INTENT_RESULT_SCHEMA = "semantic.intent.result.v1";
export const SEMANTIC_INTENT_ENDPOINT = "/api/intents";
export const SEMANTIC_INTENT_KIND = "record";

export const SEMANTIC_INTENT_LIMITS = Object.freeze({
  identifierBytes: 128,
  targetKindBytes: 64,
  topicTitleBytes: 256,
  bodyBytes: 16_384,
  requestBytes: 32_768,
});

export const TRANSPORT_STATES = Object.freeze([
  "idle",
  "sending",
  "received",
  "unknown",
  "rejected",
]);

export const LOCAL_STATES = Object.freeze([
  "accepted",
  "no_change",
  "rejected",
  "failed",
  "unknown",
]);

export const GITHUB_STATES = Object.freeze([
  "not_started",
  "pending",
  "applied",
  "unknown",
  "permanent_failure",
]);

const DRAFT_KEYS = new Set([
  "intent_id",
  "topic_id",
  "body",
  "topic_title",
  "target_ref",
]);
const INTENT_KEYS = new Set([
  "schema",
  "intent_id",
  "topic_id",
  "kind",
  "body",
  "topic_title",
  "target_ref",
]);
const TARGET_REF_KEYS = new Set(["kind", "id"]);
const SUBMISSION_KEYS = new Set(["intent", "requestBody"]);
const RESULT_KEYS = new Set([
  "schema",
  "intent_id",
  "local_state",
  "github_state",
  "issue_number",
  "comment_id",
  "receipt_id",
]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const FORBIDDEN_TEXT_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertRecord(value, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be a plain object`);
  return value;
}

function assertClosedKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label} contains unknown field: ${key}`);
  }
}

function utf8Length(value) {
  return UTF8.encode(value).byteLength;
}

function assertWellFormedUnicode(value, label) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xD800 && unit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) {
        throw new TypeError(`${label} contains an unpaired surrogate`);
      }
      index += 1;
    } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
      throw new TypeError(`${label} contains an unpaired surrogate`);
    }
  }
}

function assertIdentifier(value, label, maxBytes = SEMANTIC_INTENT_LIMITS.identifierBytes) {
  if (typeof value !== "string" || !ID_PATTERN.test(value) || utf8Length(value) > maxBytes) {
    throw new TypeError(`${label} must be a valid ASCII token no longer than ${maxBytes} bytes`);
  }
  return value;
}

function assertText(value, label, maxBytes) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  assertWellFormedUnicode(value, label);
  if (FORBIDDEN_TEXT_CONTROL.test(value)) {
    throw new TypeError(`${label} contains a forbidden control character`);
  }
  const bytes = utf8Length(value);
  if (bytes > maxBytes) {
    throw new TypeError(`${label} exceeds ${maxBytes} UTF-8 bytes`);
  }
  return value;
}

function assertOptionalPositiveInteger(value, label) {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function defaultIdFactory() {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID !== "function") {
    throw new Error("intent_id is required when crypto.randomUUID is unavailable");
  }
  return randomUUID.call(globalThis.crypto);
}

function normalizeTargetRef(value) {
  const input = assertRecord(value, "target_ref");
  assertClosedKeys(input, TARGET_REF_KEYS, "target_ref");
  return Object.freeze({
    kind: assertIdentifier(
      input.kind,
      "target_ref.kind",
      SEMANTIC_INTENT_LIMITS.targetKindBytes,
    ),
    id: assertIdentifier(input.id, "target_ref.id"),
  });
}

function normalizeIntent(value) {
  const input = assertRecord(value, "intent");
  assertClosedKeys(input, INTENT_KEYS, "intent");

  if (input.schema !== SEMANTIC_INTENT_SCHEMA) {
    throw new TypeError(`intent.schema must be ${SEMANTIC_INTENT_SCHEMA}`);
  }
  if (input.kind !== SEMANTIC_INTENT_KIND) {
    throw new TypeError(`intent.kind must be ${SEMANTIC_INTENT_KIND}`);
  }

  const normalized = {
    schema: SEMANTIC_INTENT_SCHEMA,
    intent_id: assertIdentifier(input.intent_id, "intent.intent_id"),
    topic_id: assertIdentifier(input.topic_id, "intent.topic_id"),
    kind: SEMANTIC_INTENT_KIND,
    body: assertText(input.body, "intent.body", SEMANTIC_INTENT_LIMITS.bodyBytes),
  };

  if (OWN.call(input, "topic_title")) {
    normalized.topic_title = assertText(
      input.topic_title,
      "intent.topic_title",
      SEMANTIC_INTENT_LIMITS.topicTitleBytes,
    );
  }
  if (OWN.call(input, "target_ref")) {
    normalized.target_ref = normalizeTargetRef(input.target_ref);
  }

  return Object.freeze(normalized);
}

function normalizeSubmission(value) {
  const input = assertRecord(value, "submission");
  assertClosedKeys(input, SUBMISSION_KEYS, "submission");
  const intent = normalizeIntent(input.intent);
  const canonicalBody = JSON.stringify(intent);
  if (input.requestBody !== canonicalBody) {
    throw new TypeError("submission.requestBody must be the exact canonical intent bytes");
  }
  if (utf8Length(canonicalBody) > SEMANTIC_INTENT_LIMITS.requestBytes) {
    throw new TypeError(`submission.requestBody exceeds ${SEMANTIC_INTENT_LIMITS.requestBytes} UTF-8 bytes`);
  }
  return Object.freeze({ intent, requestBody: canonicalBody });
}

function rejectedResult(intentId, errorCode) {
  return Object.freeze({
    transport_state: "rejected",
    intent_id: intentId,
    local_state: "unknown",
    github_state: "unknown",
    error_code: errorCode,
  });
}

export function createSemanticIntentSubmission(draft, { idFactory = defaultIdFactory } = {}) {
  const input = assertRecord(draft, "draft");
  assertClosedKeys(input, DRAFT_KEYS, "draft");
  if (typeof idFactory !== "function") throw new TypeError("idFactory must be a function");

  const intentId = OWN.call(input, "intent_id") ? input.intent_id : idFactory();
  const intent = {
    schema: SEMANTIC_INTENT_SCHEMA,
    intent_id: assertIdentifier(intentId, "draft.intent_id"),
    topic_id: assertIdentifier(input.topic_id, "draft.topic_id"),
    kind: SEMANTIC_INTENT_KIND,
    body: assertText(input.body, "draft.body", SEMANTIC_INTENT_LIMITS.bodyBytes),
  };

  if (OWN.call(input, "topic_title")) {
    intent.topic_title = assertText(
      input.topic_title,
      "draft.topic_title",
      SEMANTIC_INTENT_LIMITS.topicTitleBytes,
    );
  }
  if (OWN.call(input, "target_ref")) {
    intent.target_ref = normalizeTargetRef(input.target_ref);
  }

  return normalizeSubmission({ intent, requestBody: JSON.stringify(intent) });
}

export function parseSemanticIntentResult(value, { expectedIntentId } = {}) {
  const input = assertRecord(value, "result");
  assertClosedKeys(input, RESULT_KEYS, "result");

  if (input.schema !== SEMANTIC_INTENT_RESULT_SCHEMA) {
    throw new TypeError(`result.schema must be ${SEMANTIC_INTENT_RESULT_SCHEMA}`);
  }

  const intentId = assertIdentifier(input.intent_id, "result.intent_id");
  if (expectedIntentId !== undefined && intentId !== expectedIntentId) {
    throw new TypeError("result.intent_id does not match the submitted intent");
  }
  if (!LOCAL_STATES.includes(input.local_state)) {
    throw new TypeError(`unsupported local_state: ${input.local_state}`);
  }
  if (!GITHUB_STATES.includes(input.github_state)) {
    throw new TypeError(`unsupported github_state: ${input.github_state}`);
  }

  const result = {
    schema: SEMANTIC_INTENT_RESULT_SCHEMA,
    intent_id: intentId,
    local_state: input.local_state,
    github_state: input.github_state,
  };

  for (const [key, label] of [
    ["issue_number", "result.issue_number"],
    ["comment_id", "result.comment_id"],
  ]) {
    if (OWN.call(input, key)) result[key] = assertOptionalPositiveInteger(input[key], label);
  }
  if (OWN.call(input, "receipt_id")) {
    result.receipt_id = assertIdentifier(input.receipt_id, "result.receipt_id");
  }
  if (OWN.call(result, "comment_id") && !OWN.call(result, "issue_number")) {
    throw new TypeError("result.comment_id requires result.issue_number");
  }
  if (result.github_state === "applied" && !OWN.call(result, "issue_number")) {
    throw new TypeError("github_state=applied requires result.issue_number");
  }

  return Object.freeze(result);
}

export async function submitSemanticIntent(submission, { fetchImpl = globalThis.fetch } = {}) {
  const prepared = normalizeSubmission(submission);
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");

  let response;
  try {
    response = await fetchImpl(SEMANTIC_INTENT_ENDPOINT, {
      method: "POST",
      headers: Object.freeze({
        accept: "application/json",
        "content-type": "application/json",
      }),
      body: prepared.requestBody,
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    return Object.freeze({
      transport_state: "unknown",
      intent_id: prepared.intent.intent_id,
      local_state: "unknown",
      github_state: "unknown",
      error_code: "transport_ambiguous",
    });
  }

  const contentType = response?.headers?.get?.("content-type");
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    return rejectedResult(prepared.intent.intent_id, "invalid_response_content_type");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return rejectedResult(prepared.intent.intent_id, "malformed_response_json");
  }

  let result;
  try {
    result = parseSemanticIntentResult(payload, {
      expectedIntentId: prepared.intent.intent_id,
    });
  } catch {
    return rejectedResult(prepared.intent.intent_id, "invalid_response_contract");
  }

  return Object.freeze({
    transport_state: "received",
    ...result,
  });
}
