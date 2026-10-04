// ui.component.registry.v1
//
// Renderer-neutral component registry contract for A2UI / SDUI surfaces.
// This module owns NO browser DOM. It describes components (ids, versions,
// accepted input kinds, produced output kinds, props/state/events, adapter
// assets, stability) and provides deterministic lookup over recursive node
// trees. Adapters (HTML/CSS/JS/CLI/TUI) consume these descriptors; they are
// not defined here.

export const REGISTRY_KIND = "ui.component.registry.v1";
export const ENTRY_KIND = "ui.component.entry.v1";
export const NODE_KIND = "ui.node.v1";

export const STABILITY = ["experimental", "stable", "deprecated"];

// Component families are open strings. New families (e.g. future "form",
// "chart", "map") need no schema change: this list documents current
// families only and is not an allow-list.
export const KNOWN_FAMILIES = [
  "primitive",
  "layout",
  "action",
  "slide",
  "questionnaire",
  "need_zoom",
];

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asStringArray(value) {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter((item) => typeof item === "string" && item.length > 0);
}

// defineComponent validates and normalizes a single registry entry.
// `id` is the recursive node type / SDUI component id used for adapter lookup.
export function defineComponent(spec) {
  if (!isObject(spec)) throw new TypeError("component spec must be an object");
  const id = spec.id || spec.componentId || spec.component_id || spec.type || spec.name;
  if (!id || typeof id !== "string") throw new Error("component entry requires a string id");
  const stability = spec.stability || "experimental";
  if (!STABILITY.includes(stability)) throw new Error(`unknown stability for ${id}: ${stability}`);
  const childrenPolicy = spec.childrenPolicy || "recursive";
  if (!["recursive", "none", "templated", "generated"].includes(childrenPolicy)) {
    throw new Error(`unknown childrenPolicy for ${id}: ${childrenPolicy}`);
  }
  return {
    kind: ENTRY_KIND,
    id,
    version: spec.version || "v1",
    family: spec.family || "primitive",
    stability,
    description: spec.description || "",
    // What recursive node / payload kinds this component accepts as input.
    acceptsInputKinds: asStringArray(asStringArray(spec.acceptsInputKinds).length ? spec.acceptsInputKinds : ["ui.node.v1"]),
    // What output kinds an adapter can produce for this component.
    producesOutputKinds: asStringArray(spec.producesOutputKinds),
    // Declared prop names (documentation/contract only; values stay open).
    props: asStringArray(spec.props),
    // State paths this component reads or writes (renderer-neutral).
    state: asStringArray(spec.state),
    // Event kinds this component emits.
    events: asStringArray(spec.events),
    // Action intents this component dispatches.
    actions: asStringArray(spec.actions),
    childrenPolicy,
    // Adapter asset descriptors by adapter kind, e.g. { html: ["..."] }.
    adapterAssets: isObject(spec.adapterAssets) ? spec.adapterAssets : {},
    // Optional SDUI surface restriction, consumed by sdui-policy-gate.
    // null means "allowed on any surface".
    allowedSurfaceIds: spec.allowedSurfaceIds == null ? null : asStringArray(spec.allowedSurfaceIds),
  };
}

// makeRegistry builds an immutable lookup over a list of entries (or specs).
// The returned object is compatible with sdui-policy-gate.normalizeRegistry:
// it exposes `.components` (array) and Map-like `.get`/`.has`.
export function makeRegistry(entries = [], meta = {}) {
  const components = entries.map((entry) => (entry && entry.kind === ENTRY_KIND ? entry : defineComponent(entry)));
  const byId = new Map();
  for (const entry of components) {
    if (byId.has(entry.id)) throw new Error(`duplicate component id: ${entry.id}`);
    byId.set(entry.id, entry);
  }
  return {
    kind: REGISTRY_KIND,
    version: meta.version || "v1",
    title: meta.title || "ui component registry",
    components,
    has: (id) => byId.has(id),
    get: (id) => byId.get(id) || null,
    list: () => components.slice(),
    families: () => [...new Set(components.map((entry) => entry.family))].sort(),
    // Deterministic adapter lookup by recursive node type / component id.
    // Unknown ids resolve to a stable fallback descriptor, never throw.
    lookup: (nodeTypeOrId) => byId.get(nodeTypeOrId) || unknownEntry(nodeTypeOrId),
    toJSON: () => ({ kind: REGISTRY_KIND, version: meta.version || "v1", title: meta.title || "ui component registry", components }),
  };
}

// Deterministic descriptor for an unregistered node type. Callers can rely on
// `registered === false` to choose a passthrough/diagnostic rendering.
export function unknownEntry(nodeTypeOrId) {
  return {
    kind: ENTRY_KIND,
    id: typeof nodeTypeOrId === "string" ? nodeTypeOrId : "unknown",
    version: "v1",
    family: "unknown",
    stability: "experimental",
    registered: false,
    childrenPolicy: "recursive",
    producesOutputKinds: [],
    acceptsInputKinds: ["ui.node.v1"],
    props: [],
    state: [],
    events: [],
    actions: [],
    adapterAssets: {},
    allowedSurfaceIds: null,
    note: "unregistered node type; adapter should render a deterministic passthrough/diagnostic",
  };
}

export function assertRegistry(registry) {
  if (!registry || registry.kind !== REGISTRY_KIND) throw new Error("not a ui.component.registry.v1");
  if (!Array.isArray(registry.components)) throw new Error("registry.components must be an array");
  for (const entry of registry.components) {
    if (entry.kind !== ENTRY_KIND) throw new Error(`registry entry has unexpected kind: ${entry.kind}`);
    if (!entry.id) throw new Error("registry entry missing id");
  }
  return registry;
}
