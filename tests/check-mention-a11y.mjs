import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertEnvelope,
  buildMentionIndex,
  makeOwnerRawInputDraft,
  parseJsonl,
  parseMentionTokens,
  projectAccessibleLogPanel,
  projectNeedZoomSurface,
} from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const text = fs.readFileSync(path.join(root, "tests/fixtures/need-zoom.raw.jsonl"), "utf8");
const parsed = parseJsonl(text);
const surface = projectNeedZoomSurface(parsed.records);

const mentionIndex = buildMentionIndex(surface);
assert.equal(mentionIndex.kind, "ui.mention.index.v1");
assert.ok(mentionIndex.mentions.some((m) => m.refKind === "purpose" && m.refId === "company exit"));
assert.ok(mentionIndex.mentions.some((m) => m.refKind === "projectionNode" && m.refId === "sum_purpose"));

const tokens = parseMentionTokens("check @company exit @sum_purpose @unknown", mentionIndex);
assert.ok(tokens.some((m) => m.refId === "sum_purpose"));
assert.ok(tokens.some((m) => m.refId === "unknown" && m.unresolved === true));

const draft = makeOwnerRawInputDraft({
  body: "@sum_purpose needs owner review",
  goalRef: "goal:repo-package-ui-loop",
  purposeRef: "company exit",
  ownerRef: "CEO",
  sourceSurface: "ui-log-panel",
  mentionIndex,
});
assertEnvelope(draft);
assert.equal(draft.payloadKind, "owner.raw.input.v1");
assert.equal(draft.payload.goalRef, "goal:repo-package-ui-loop");
assert.equal(draft.payload.ownerRef, "CEO");
assert.equal(draft.meta.approval, false);
assert.equal(draft.meta.authorizesFire, false);
assert.ok(draft.payload.targetRefs.some((ref) => ref.targetId === "sum_purpose"));

const a11y = projectAccessibleLogPanel(surface);
assert.equal(a11y.kind, "ui.accessible.log_panel.v1");
assert.ok(a11y.label.includes("company exit"));
assert.ok(a11y.fields.some((f) => f.id === "body" && f.autocomplete === "mentions"));
assert.ok(a11y.mentionIndex.mentions.length >= mentionIndex.mentions.length);

console.log(JSON.stringify({
  status: "mention-a11y-check-pass",
  mentions: mentionIndex.mentions.length,
  payloadKind: draft.payloadKind,
  a11y: a11y.kind,
}, null, 2));
