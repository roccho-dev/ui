import crypto from "node:crypto";

const ROLES = ["CEO", "CTO", "CFO", "CPO", "COO"];

export function parseJsonl(text) {
  const records = [];
  const errors = [];
  String(text)
    .split(/\n+/)
    .forEach((raw, index) => {
      const line = raw.trim();
      if (!line) return;
      try {
        records.push(JSON.parse(line));
      } catch (error) {
        errors.push({ line: index + 1, error: String(error.message || error), preview: line.slice(0, 160) });
      }
    });
  return { records, errors };
}

export function toEnvelope(payload, meta = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("payload must be an object");
  }
  const now = new Date().toISOString();
  const payloadKind = typeof payload.kind === "string" && payload.kind ? payload.kind : "unknown.payload.v1";
  return {
    kind: "jsonl.record.generic.v1",
    recordId: `ui:${crypto.randomBytes(8).toString("hex")}`,
    recordedAt: now,
    payloadKind,
    payloadVersion: typeof payload.version === "string" ? payload.version : "v1",
    payload,
    meta: {
      source: "ui-modeling-corr-port",
      canonicalStatus: "projection-input-not-authority",
      approval: false,
      ...meta,
    },
  };
}

export function assertEnvelope(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("record must be an object");
  if (record.kind !== "jsonl.record.generic.v1") throw new Error(`unexpected envelope kind: ${record.kind}`);
  if (!record.recordId) throw new Error("recordId is required");
  if (!record.recordedAt) throw new Error("recordedAt is required");
  if (!record.payloadKind) throw new Error("payloadKind is required");
  if (!record.payload || typeof record.payload !== "object" || Array.isArray(record.payload)) throw new Error("payload object is required");
  return record;
}

export function normalizeRecords(records) {
  return records.map(assertEnvelope).slice().sort((a, b) => String(a.recordedAt).localeCompare(String(b.recordedAt)));
}

export function payloadKindCounts(records) {
  const counts = new Map();
  for (const record of records) counts.set(record.payloadKind, (counts.get(record.payloadKind) || 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function latestPayload(records, payloadKind, predicate = () => true) {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i];
    if (record.payloadKind === payloadKind && predicate(record.payload, record)) return record.payload;
  }
  return null;
}

export function projectNeedZoomSurface(inputRecords) {
  const records = normalizeRecords(inputRecords);
  const payloads = records.map((record) => record.payload);
  const surface = latestPayload(records, "need_zoom.surface_config.v1") || {};
  const query = latestPayload(records, "need_zoom.ui_query.v1") || {};
  const facets = payloads.filter((payload) => payload.kind === "need_zoom.facet.v1").map(projectFacet);
  const nodes = payloads.filter((payload) => payload.kind === "need_zoom.node.v1").map(projectNode);
  const edges = payloads.filter((payload) => payload.kind === "need_zoom.edge.v1").map(projectEdge);
  const events = payloads.filter((payload) => payload.kind === "need_zoom.event.v1").map(projectEvent);
  const purposeEvents = records.filter((r) => r.payload.kind === "need_zoom.event.v1" && r.payload.type === "purpose.set");
  const guardResults = records.filter((r) => r.payloadKind === "need_zoom.guard_result.v1");
  const currentPurpose = [...purposeEvents].reverse().find((r) => r.payload?.label)?.payload?.label || "unset";
  const purposeTimeline = purposeEvents.map((r) => ({
    label: r.payload?.label || null,
    at: r.payload?.at || r.recordedAt,
  }));
  const guardVerdicts = projectGuardVerdicts(records, purposeTimeline);
  const cxoOverview = projectCxoOverview(records, events);
  const received = Object.fromEntries(ROLES.map((role) => [role, 0]));
  for (const event of events) if (event.type === "cxo.receive" && received[event.to] != null) received[event.to] += 1;
  const scale = numberOr(query.scale, 1);
  const level = zoomLevel(scale);
  const focus = typeof query.focus === "string" ? query.focus : null;
  const visibleNodeIds = visibleNodes(nodes, edges, level, focus).map((node) => node.id);
  const actions = projectActions(records);
  return {
    kind: "need_zoom.voronoi_surface.v1",
    surface: {
      title: surface.title || "Need Zoom Voronoi PoC",
      world: {
        w: numberOr(surface.w, 1000),
        h: numberOr(surface.h, 700),
        cell: numberOr(surface.cell, 7),
      },
      zoom: {
        scale,
        level,
        label: zoomLabel(level),
        panX: numberOr(query.panX, 0),
        panY: numberOr(query.panY, 0),
        focus,
        action: query.action || "projection",
      },
      purpose: currentPurpose,
      purposeTimeline,
      guardVerdicts,
      rawCount: records.length,
    },
    facets,
    nodes,
    edges,
    visibleNodeIds,
    visibleEdges: edges.filter((edge) => visibleNodeIds.includes(edge.a) && visibleNodeIds.includes(edge.b)),
    events: events.slice(-16).reverse(),
    received,
    cxoOverview,
    actions,
    pool: {
      kind: "need_zoom.raw_pool.v1",
      rawCount: records.length,
      byPayloadKind: payloadKindCounts(records),
    },
  };
}

function projectFacet(payload) {
  return {
    id: String(payload.id || ""),
    color: String(payload.color || "#8fb9ff"),
    label: String(payload.label || payload.id || ""),
  };
}

function projectNode(payload) {
  return {
    id: String(payload.id || ""),
    label: String(payload.label || payload.id || ""),
    facet: String(payload.facet || "system"),
    role: payload.role || null,
    eventRole: payload.eventRole || null,
    lvl: numberOr(payload.lvl, 0),
    max: payload.max == null ? null : numberOr(payload.max, null),
    x: numberOr(payload.x, 0),
    y: numberOr(payload.y, 0),
    r: numberOr(payload.r, 42),
    parent: payload.parent || null,
    risk: numberOr(payload.risk, 0),
    summary: String(payload.summary || ""),
  };
}

function projectEdge(payload) {
  return {
    a: String(payload.a || ""),
    b: String(payload.b || ""),
    k: String(payload.k || "edge"),
    w: numberOr(payload.w, 1),
  };
}

function projectEvent(payload) {
  return {
    type: String(payload.type || "unknown"),
    label: payload.label || null,
    by: payload.by || null,
    note: payload.note || null,
    to: payload.to || null,
    topic: payload.topic || null,
    node: payload.node || null,
    message: payload.message || null,
    at: payload.at || null,
  };
}

function projectGuardVerdicts(records, purposeTimeline) {
  const verdicts = [];
  const explicitResults = records.filter((r) => r.payloadKind === "need_zoom.guard_result.v1");
  const signalsByPurpose = new Map();
  for (const record of records) {
    if (record.payloadKind === "need_zoom.event.v1" && record.payload?.type === "purpose.guard") {
      const purpose = record.payload?.label || "unknown";
      if (!signalsByPurpose.has(purpose)) signalsByPurpose.set(purpose, []);
      signalsByPurpose.get(purpose).push(record);
    }
  }
  for (const [purpose, signals] of signalsByPurpose.entries()) {
    const resultForPurpose = explicitResults.find((r) => r.payload?.purpose === purpose);
    verdicts.push({
      purpose,
      signal: signals.length > 0 ? "received" : null,
      verdict: resultForPurpose ? resultForPurpose.payload?.verdict || "pending" : "missing",
      at: resultForPurpose?.recordedAt || signals[signals.length - 1]?.recordedAt || null,
    });
  }
  return verdicts;
}

function projectCxoOverview(records, events) {
  const overview = Object.fromEntries(ROLES.map((role) => [
    role,
    {
      role,
      receivedCount: 0,
      latestTopic: null,
      latestMessage: null,
      latestNode: null,
      hasVisibleAffordance: false,
    },
  ]));
  for (const event of events) {
    if (event.type === "cxo.receive" && overview[event.to]) {
      overview[event.to].receivedCount += 1;
      if (event.topic) overview[event.to].latestTopic = event.topic;
      if (event.message) overview[event.to].latestMessage = event.message;
      if (event.node) overview[event.to].latestNode = event.node;
    }
  }
  for (const role of ROLES) {
    overview[role].hasVisibleAffordance = overview[role].receivedCount > 0;
  }
  return overview;
}

function projectActions(records) {
  const currentPurpose = [...records]
    .reverse()
    .find((r) => r.payload?.kind === "need_zoom.event.v1" && r.payload?.type === "purpose.set" && r.payload?.label)?.payload?.label;
  return [
    {
      id: "post-mismatch",
      kind: "ui.action.v1",
      targetEndpoint: "/api/raw",
      payloadKind: "ui.review.feedback.v1",
      idempotencyKeyContract: "stable-ui-feedback-key",
      // Explicit target so the queued feedback routes to the model element it
      // concerns even after UI changes (C06). Additive to the existing shape.
      targetRef: {
        kind: "ui.targetRef.v1",
        targetKind: "purpose",
        targetId: currentPurpose || "unset",
      },
      description: "Queue a review feedback post with deduplication support",
    },
  ];
}

function visibleNodes(nodes, edges, level, focus) {
  const visible = new Set(nodes.filter((node) => node.lvl <= level).map((node) => node.id));
  if (focus) {
    visible.add(focus);
    for (const node of nodes) if (node.parent === focus) visible.add(node.id);
    for (const edge of edges) {
      if (edge.a === focus) visible.add(edge.b);
      if (edge.b === focus) visible.add(edge.a);
    }
  }
  return nodes.filter((node) => visible.has(node.id));
}

function zoomLevel(scale) {
  if (scale < 0.68) return 0;
  if (scale < 1.15) return 1;
  if (scale < 1.85) return 2;
  return 3;
}

function zoomLabel(level) {
  return ["overview", "tasks", "evidence/time", "raw"][level] || "raw";
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
