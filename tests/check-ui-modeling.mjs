import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertEnvelope,
  htmlBox,
  jsBox,
  cssBox,
  parseJsonl,
  payloadKindCounts,
  projectNeedZoomSurface,
  toEnvelope,
} from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const text = fs.readFileSync(path.join(root, "fixtures/need-zoom.raw.jsonl"), "utf8");
const parsed = parseJsonl(text);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.records.length, 7);
for (const record of parsed.records) assertEnvelope(record);

const counts = payloadKindCounts(parsed.records);
assert.equal(counts["need_zoom.node.v1"], 2);
assert.equal(counts["need_zoom.event.v1"], 1);

const projection = projectNeedZoomSurface(parsed.records);
assert.equal(projection.kind, "need_zoom.voronoi_surface.v1");
assert.equal(projection.surface.purpose, "company exit");
assert.equal(projection.surface.rawCount, 7);
assert.equal(projection.nodes.length, 2);
assert.equal(projection.edges.length, 1);
assert.ok(projection.visibleNodeIds.includes("sum_purpose"));
assert.equal(projection.pool.byPayloadKind["need_zoom.surface_config.v1"], 1);
assert.ok(Array.isArray(projection.surface.purposeTimeline), "purposeTimeline must be exposed");
assert.ok(Array.isArray(projection.surface.guardVerdicts), "guardVerdicts must be exposed");
assert.ok(projection.cxoOverview, "cxoOverview must be exposed");
assert.ok(projection.actions, "actions must be exposed");
assert.ok(projection.actions.some((a) => a.id === "post-mismatch"), "post-mismatch action must exist");
assert.equal(projection.actions[0].payloadKind, "ui.review.feedback.v1", "action must target ui.review.feedback.v1");
assert.equal(projection.actions[0].idempotencyKeyContract, "stable-ui-feedback-key", "action must have idempotency contract");

const envelope = toEnvelope({ kind: "need_zoom.event.v1", type: "evidence.add" });
assert.equal(envelope.kind, "jsonl.record.generic.v1");
assert.equal(envelope.payloadKind, "need_zoom.event.v1");
assert.equal(envelope.meta.approval, false);

for (const box of [htmlBox, cssBox, jsBox]) {
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
