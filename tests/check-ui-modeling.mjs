import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertEnvelope,
  htmlBox,
  jsBox,
  cssBox,
  purposeAtlasHtmlBox,
  parseJsonl,
  payloadKindCounts,
  projectNeedZoomSurface,
  toEnvelope,
} from "#core-port";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const text = fs.readFileSync(path.join(root, "tests/fixtures/need-zoom.raw.jsonl"), "utf8");
const parsed = parseJsonl(text);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.records.length, 9);
for (const record of parsed.records) assertEnvelope(record);

const counts = payloadKindCounts(parsed.records);
assert.equal(counts["need_zoom.node.v1"], 2);
assert.equal(counts["need_zoom.event.v1"], 3);

const projection = projectNeedZoomSurface(parsed.records);
assert.equal(projection.kind, "need_zoom.voronoi_surface.v1");
assert.equal(projection.surface.purpose, "company exit");
assert.equal(projection.surface.rawCount, 9);
assert.equal(projection.nodes.length, 2);
assert.equal(projection.edges.length, 1);
assert.ok(projection.visibleNodeIds.includes("sum_purpose"));
assert.equal(projection.pool.byPayloadKind["need_zoom.surface_config.v1"], 1);

// Verify purposeTimeline contains purpose.set entry
assert.ok(Array.isArray(projection.surface.purposeTimeline), "purposeTimeline must be array");
assert.ok(projection.surface.purposeTimeline.length > 0, "purposeTimeline must contain at least one entry");
const purposeSetEntry = projection.surface.purposeTimeline.find((e) => e.label === "company exit");
assert.ok(purposeSetEntry, "purposeTimeline must contain purpose.set entry with label");

// Verify Purpose Guard signal without explicit result produces missing verdict
assert.ok(Array.isArray(projection.surface.guardVerdicts), "guardVerdicts must be array");
const exitGuardVerdict = projection.surface.guardVerdicts.find((v) => v.purpose === "company exit");
assert.ok(exitGuardVerdict, "guardVerdicts must contain verdict for company exit purpose");
assert.equal(exitGuardVerdict.signal, "received", "purpose.guard signal must be marked received");
assert.equal(exitGuardVerdict.verdict, "missing", "guard without explicit result must produce missing verdict");

// Verify explicit CXO receive produces per-role overview with affordance
assert.ok(projection.cxoOverview, "cxoOverview must be exposed");
assert.equal(typeof projection.cxoOverview.CEO, "object", "cxoOverview must have CEO role");
assert.equal(projection.cxoOverview.CEO.receivedCount, 1, "CEO must have received 1 message");
assert.equal(projection.cxoOverview.CEO.latestTopic, "exit-strategy", "CEO must have latestTopic set");
assert.equal(projection.cxoOverview.CEO.latestMessage, "review required", "CEO must have latestMessage set");
assert.equal(projection.cxoOverview.CEO.latestNode, "sum_purpose", "CEO must have latestNode set");
assert.equal(projection.cxoOverview.CEO.hasVisibleAffordance, true, "CEO must have visible affordance");

// Verify post-mismatch action contract
assert.ok(projection.actions, "actions must be exposed");
assert.ok(projection.actions.some((a) => a.id === "post-mismatch"), "post-mismatch action must exist");
const postMismatchAction = projection.actions[0];
assert.equal(postMismatchAction.id, "post-mismatch", "action id must be post-mismatch");
assert.equal(postMismatchAction.targetEndpoint, "/api/raw", "action must target /api/raw endpoint");
assert.equal(postMismatchAction.payloadKind, "ui.review.feedback.v1", "action must target ui.review.feedback.v1");
assert.equal(postMismatchAction.idempotencyKeyContract, "stable-ui-feedback-key", "action must have stable idempotency contract");

const envelope = toEnvelope({ kind: "need_zoom.event.v1", type: "evidence.add" });
assert.equal(envelope.kind, "jsonl.record.generic.v1");
assert.equal(envelope.payloadKind, "need_zoom.event.v1");
assert.equal(envelope.meta.approval, false);

for (const box of [htmlBox, cssBox, jsBox, purposeAtlasHtmlBox]) {
  assert.equal(box.kind, "ui.adapter.box.v1");
  assert.equal(box.ownsState, false);
  assert.ok(box.assets.length >= 1);
}

console.log(JSON.stringify({
  status: "ui-modeling-corr-port-check-pass",
  records: parsed.records.length,
  projection: projection.kind,
  adapters: [htmlBox.id, cssBox.id, jsBox.id],
}, null, 2));
