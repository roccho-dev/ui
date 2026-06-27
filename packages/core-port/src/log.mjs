// UI log / action / request targetability (C06) with non-authority boundary (C07).
//
// Every UI log, action, or request record carries an explicit targetRef so the
// record can be routed to the model element it concerns even after the UI
// changes. Raw UI records are NEVER authority: meta.canonicalStatus marks them
// as projection input and meta.approval is always false. A UI request/log is
// not SSOT approval, merge approval, or fire authorization.

import crypto from "node:crypto";

// Model element kinds a UI record may target. Open via "custom" + targetId for
// future element kinds without schema churn.
export const TARGET_KINDS = [
  "purpose",
  "orgMember",
  "cxo",
  "product",
  "contract",
  "evidence",
  "relation", // relation / edge
  "generation", // generation / meta layer
  "projectionNode", // projection / view node
  "component",
  "custom",
];

// Fields a UI-originated record must never assert. Mirrors the authority
// boundary enforced by policy/packages/sdui-policy-gate (C07).
export const FORBIDDEN_AUTHORITY_FIELDS = [
  "approval",
  "approvalEndpoint",
  "approvalStatus",
  "authorizesFire",
  "authorizesMerge",
  "canonicalAppend",
  "canonicalMutation",
  "canonicalState",
  "decisionAccepted",
  "directAssignment",
  "fireAuthorization",
  "mergeApproval",
  "mergeReady",
  "ownerDecisionAccepted",
  "policyRewrite",
  "statusApproval",
];

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// makeTargetRef builds and validates an explicit target reference.
export function makeTargetRef({ kind, id, label, path } = {}) {
  if (!TARGET_KINDS.includes(kind)) throw new Error(`unknown targetRef kind: ${kind}`);
  if (!id || typeof id !== "string") throw new Error("targetRef requires a string id");
  return {
    kind: "ui.targetRef.v1",
    targetKind: kind,
    targetId: id,
    ...(label ? { label } : {}),
    ...(path ? { path } : {}),
  };
}

export function assertTargetRef(targetRef) {
  if (!isObject(targetRef)) throw new Error("targetRef must be an object");
  if (!TARGET_KINDS.includes(targetRef.targetKind)) throw new Error(`unknown targetKind: ${targetRef.targetKind}`);
  if (!targetRef.targetId) throw new Error("targetRef.targetId is required");
  return targetRef;
}

function assertNoAuthority(payload) {
  for (const field of FORBIDDEN_AUTHORITY_FIELDS) {
    if (isObject(payload) && field in payload) {
      throw new Error(`UI record must not assert authority field: ${field}`);
    }
  }
}

// toUiLog wraps a payload as a non-authority UI log record with an explicit
// targetRef. Throws if the payload tries to assert authority (C07).
export function toUiLog(payload, { targetRef, source = "ui-modeling-corr-port", recordId, recordedAt } = {}) {
  if (!isObject(payload)) throw new TypeError("payload must be an object");
  assertNoAuthority(payload);
  const ref = assertTargetRef(targetRef);
  return {
    kind: "jsonl.record.generic.v1",
    recordId: recordId || `ui:${crypto.randomBytes(8).toString("hex")}`,
    recordedAt: recordedAt || new Date().toISOString(),
    payloadKind: typeof payload.kind === "string" && payload.kind ? payload.kind : "ui.log.record.v1",
    payloadVersion: typeof payload.version === "string" ? payload.version : "v1",
    payload,
    targetRef: ref,
    meta: {
      source,
      // Non-authority boundary: a UI log/request/action is never SSOT approval,
      // merge approval, or fire authorization.
      canonicalStatus: "ui-log-not-authority",
      approval: false,
      authorizesFire: false,
      authorizesMerge: false,
    },
  };
}

// makeUiAction builds a renderer-neutral UI action affordance with an explicit
// targetRef. Compatible with the existing ui.action.v1 schema (additive).
export function makeUiAction({ id, targetEndpoint, payloadKind, idempotencyKeyContract, targetRef, description }) {
  if (!id) throw new Error("action id is required");
  const ref = assertTargetRef(targetRef);
  return {
    id,
    kind: "ui.action.v1",
    targetEndpoint: targetEndpoint || "/api/raw",
    payloadKind: payloadKind || "ui.review.feedback.v1",
    idempotencyKeyContract: idempotencyKeyContract || "stable-ui-feedback-key",
    targetRef: ref,
    description: description || "",
    // A UI action proposes; it does not authorize.
    authorizesFire: false,
  };
}
