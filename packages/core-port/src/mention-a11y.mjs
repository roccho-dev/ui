import { assertTargetRef, makeTargetRef, toUiLog } from "./log.mjs";

const OWNER_KINDS = new Set(["owner", "orgMember", "cxo", "role", "agent"]);

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function labelOf(value, fallback = "") {
  if (!isObject(value)) return fallback;
  return String(value.label || value.name || value.title || value.id || fallback || "");
}

export function normalizeMentionRef(input) {
  if (!isObject(input)) throw new TypeError("mention ref must be an object");
  const refKind = String(input.refKind || input.kind || input.targetKind || "custom");
  const refId = String(input.refId || input.id || input.targetId || "");
  if (!refId) throw new Error("mention refId is required");
  return {
    kind: "ui.mention.ref.v1",
    refKind,
    refId,
    label: labelOf(input, refId),
    targetRef: makeTargetRef({
      kind: targetKindForMention(refKind),
      id: refId,
      label: labelOf(input, refId),
      path: input.path,
    }),
    source: input.source || input.path || null,
  };
}

export function buildMentionIndex(surface = {}) {
  const refs = new Map();
  const add = (ref) => {
    const m = normalizeMentionRef(ref);
    refs.set(`${m.refKind}:${m.refId}`, m);
  };

  for (const node of surface.nodes || []) {
    add({ refKind: "projectionNode", refId: node.id, label: node.label, path: `nodes/${node.id}` });
    if (node.role) add({ refKind: OWNER_KINDS.has(String(node.role)) ? "owner" : "role", refId: String(node.role), label: String(node.role), path: `roles/${node.role}` });
    if (node.eventRole) add({ refKind: "owner", refId: String(node.eventRole), label: String(node.eventRole), path: `owners/${node.eventRole}` });
  }

  const purpose = surface.surface?.purpose;
  if (purpose && purpose !== "unset") add({ refKind: "purpose", refId: String(purpose), label: String(purpose), path: "surface/purpose" });

  for (const edge of surface.edges || []) add({ refKind: "relation", refId: `${edge.a}->${edge.b}`, label: `${edge.a} -> ${edge.b}`, path: `edges/${edge.a}->${edge.b}` });

  return {
    kind: "ui.mention.index.v1",
    mentions: [...refs.values()].sort((a, b) => `${a.refKind}:${a.label}`.localeCompare(`${b.refKind}:${b.label}`)),
  };
}

export function parseMentionTokens(text, mentionIndex) {
  const body = String(text || "");
  const tokens = [...body.matchAll(/@([^\s@]+)/g)].map((m) => m[1]);
  const byLabel = new Map((mentionIndex?.mentions || []).map((m) => [m.label, m]));
  const byId = new Map((mentionIndex?.mentions || []).map((m) => [m.refId, m]));
  return tokens.map((token) => byLabel.get(token) || byId.get(token) || {
    kind: "ui.mention.unresolved.v1",
    refKind: "custom",
    refId: token,
    label: token,
    unresolved: true,
  });
}

export function makeOwnerRawInputDraft({ body, goalRef, purposeRef, ownerRef, sourceSurface = "ui", targetRef, mentionIndex, payload = {} } = {}) {
  const resolvedMentions = parseMentionTokens(body, mentionIndex);
  const target = targetRef || resolvedMentions.find((m) => m.targetRef)?.targetRef || makeTargetRef({ kind: "custom", id: "unassigned", label: "unassigned" });
  assertTargetRef(target);
  return toUiLog({
    kind: "owner.raw.input.v1",
    goalRef: String(goalRef || "unset"),
    purposeRef: String(purposeRef || goalRef || "unset"),
    ownerRef: String(ownerRef || "unknown-owner"),
    sourceSurface,
    targetRefs: [target, ...resolvedMentions.map((m) => m.targetRef).filter(Boolean)],
    body: String(body || ""),
    mentions: resolvedMentions,
    ...payload,
  }, { targetRef: target, source: sourceSurface });
}

export function projectAccessibleLogPanel(surface = {}) {
  const mentionIndex = buildMentionIndex(surface);
  const purpose = surface.surface?.purpose || "unset";
  const visible = surface.visibleNodeIds || [];
  const warnings = [];
  if (purpose === "unset") warnings.push("purpose is unset");
  if (visible.length === 0) warnings.push("no visible nodes");
  return {
    kind: "ui.accessible.log_panel.v1",
    label: `Purpose ${purpose}; ${visible.length} visible nodes; ${mentionIndex.mentions.length} mention targets`,
    fields: [
      { id: "body", label: "log body", required: true, multiline: true, autocomplete: "mentions" },
      { id: "goalRef", label: "goal reference", required: true },
      { id: "ownerRef", label: "owner reference", required: true },
    ],
    mentionIndex,
    warnings,
  };
}

function targetKindForMention(refKind) {
  if (refKind === "purpose") return "purpose";
  if (refKind === "owner" || refKind === "role" || refKind === "cxo" || refKind === "orgMember") return "orgMember";
  if (refKind === "relation") return "relation";
  if (refKind === "component") return "component";
  if (refKind === "projectionNode") return "projectionNode";
  return "custom";
}
