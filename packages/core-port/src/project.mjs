// Renderer-neutral projection of registry JSONL into A2UI / SDUI view models.
//
// No browser side effects: every function here is pure and returns plain data
// (C08). Adapters turn these view models into HTML/CLI/TUI output; this module
// never touches the DOM.

import { defaultRegistry } from "./catalog.mjs";
import { projectNeedZoomSurface } from "./corr-port.mjs";

const SURFACE_KIND = "ui.surface.viewmodel.v1";

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// projectNode walks a recursive node tree and annotates each node with the
// registry lookup result. Unknown node types resolve to a deterministic
// `registered: false` annotation rather than throwing (C05).
export function projectNode(registry, node, ctx = {}) {
  if (!isObject(node) || typeof node.type !== "string") {
    return { kind: "ui.viewnode.v1", type: "Invalid", registered: false, error: "node must be an object with a string type", children: [] };
  }
  const entry = registry.lookup(node.type);
  const depth = ctx.depth || 0;
  const children = (Array.isArray(node.children) ? node.children : []).map((child) =>
    projectNode(registry, child, { depth: depth + 1 })
  );
  return {
    kind: "ui.viewnode.v1",
    type: node.type,
    id: node.id || null,
    registered: entry.registered !== false,
    family: entry.family,
    stability: entry.stability,
    childrenPolicy: entry.childrenPolicy,
    producesOutputKinds: entry.producesOutputKinds,
    declaredActions: entry.actions,
    declaredEvents: entry.events,
    props: isObject(node.props) ? node.props : {},
    children,
  };
}

// projectNodeTree projects a single recursive tree against a registry.
export function projectNodeTree(tree, registry = defaultRegistry()) {
  const root = projectNode(registry, tree);
  const unknownTypes = collectUnknown(root);
  return {
    kind: "ui.tree.viewmodel.v1",
    registryKind: registry.kind,
    root,
    nodeCount: countNodes(root),
    unknownTypes,
    deterministic: true,
  };
}

function collectUnknown(viewnode, set = new Set()) {
  if (!viewnode) return [...set];
  if (!viewnode.registered) set.add(viewnode.type);
  for (const child of viewnode.children || []) collectUnknown(child, set);
  return [...set];
}

function countNodes(viewnode) {
  if (!viewnode) return 0;
  return 1 + (viewnode.children || []).reduce((sum, child) => sum + countNodes(child), 0);
}

// applyRecursiveRecord folds one A2UI recursive record (TreePatch/StatePatch)
// into an accumulator { tree, state }. Pure: returns a new accumulator.
export function applyRecursiveRecord(acc, record) {
  const next = { tree: acc.tree, state: acc.state, errors: acc.errors.slice() };
  if (!isObject(record) || typeof record.type !== "string") {
    next.errors.push("record must be a recursive node with a string type");
    return next;
  }
  const props = isObject(record.props) ? record.props : {};
  if (record.type === "TreePatch" && props.op === "replace") {
    const tree = Array.isArray(record.children) ? record.children[0] : null;
    if (!tree) { next.errors.push("TreePatch replace needs one child tree"); return next; }
    next.tree = tree;
    return next;
  }
  if (record.type === "StatePatch" && props.op === "set") {
    next.state = setByPath(clone(next.state), props.path, props.value);
    return next;
  }
  if (record.type === "StatePatch" && props.op === "merge") {
    next.state = deepMerge(clone(next.state), props.value || {});
    return next;
  }
  next.errors.push(`unsupported recursive record: ${record.type}`);
  return next;
}

// projectA2uiSurface consumes A2UI recursive JSONL records (already parsed
// into objects) and produces a renderer-neutral surface view model (C08).
export function projectA2uiSurface(records, registry = defaultRegistry()) {
  let acc = { tree: null, state: {}, errors: [] };
  for (const record of records) acc = applyRecursiveRecord(acc, record);
  const treeView = acc.tree ? projectNodeTree(acc.tree, registry) : null;
  return {
    kind: SURFACE_KIND,
    registryKind: registry.kind,
    hasTree: !!acc.tree,
    state: acc.state,
    tree: treeView,
    errors: acc.errors,
    // A2UI/SDUI event contract this surface can emit, derived from registry.
    emittableEvents: treeView ? emittableEvents(treeView.root) : [],
  };
}

function emittableEvents(viewnode, set = new Set()) {
  if (!viewnode) return [...set];
  for (const ev of viewnode.declaredEvents || []) set.add(ev);
  for (const child of viewnode.children || []) emittableEvents(child, set);
  return [...set];
}

// projectQuestionnaireFlow converts the standalone questionnaire PoC flow
// (flow.replace / node.upsert ops) into a registry-driven node tree, proving
// the monolithic questionnaire becomes registry components/events (C10).
export function projectQuestionnaireFlow(records, registry = defaultRegistry()) {
  let flow = null;
  for (const record of records) {
    if (!isObject(record)) continue;
    if (record.op === "flow.replace" && isObject(record.flow)) flow = record.flow;
    if (record.op === "node.upsert" && flow && isObject(record.node)) {
      flow.nodes = flow.nodes || {};
      flow.nodes[record.node.id] = record.node;
    }
  }
  if (!flow) {
    return { kind: SURFACE_KIND, hasTree: false, errors: ["no flow.replace record found"], tree: null, state: {}, emittableEvents: [] };
  }
  const tree = flowToNodeTree(flow);
  const treeView = projectNodeTree(tree, registry);
  return {
    kind: SURFACE_KIND,
    registryKind: registry.kind,
    hasTree: true,
    state: { questionnaire: { current: flow.start || "", answers: {} } },
    tree: treeView,
    errors: [],
    emittableEvents: emittableEvents(treeView.root),
  };
}

// flowToNodeTree maps a questionnaire flow document into a QuestionFlow tree of
// registry components. Result nodes become Result components; question nodes
// become Question + ChoiceGroup + Choice components.
export function flowToNodeTree(flow) {
  const nodes = flow.nodes || {};
  const children = Object.values(nodes).map((node) => {
    if (node.type === "result") {
      return {
        type: "Result",
        id: node.id,
        props: {},
        children: [
          { type: "Title", props: { text: node.title || node.id }, children: [] },
          ...(node.body ? [{ type: "Text", props: { text: node.body }, children: [] }] : []),
        ],
      };
    }
    return {
      type: "Question",
      id: node.id,
      props: {},
      children: [
        { type: "Title", props: { text: node.title || node.id }, children: [] },
        ...(node.subtitle ? [{ type: "Text", props: { text: node.subtitle }, children: [] }] : []),
        {
          type: "ChoiceGroup",
          props: { exclusive: true },
          children: (node.choices || []).map((choice) => ({
            type: "Choice",
            props: { value: choice.id, label: choice.label, next: choice.to || null, questionId: node.id, hint: choice.hint || null },
            children: [{ type: "Text", props: { text: choice.label }, children: [] }],
          })),
        },
      ],
    };
  });
  return {
    type: "QuestionFlow",
    id: flow.id || "flow",
    props: { currentPath: "/questionnaire/current", initial: flow.start || (children[0] && children[0].id) || "" },
    children,
  };
}

// --- minimal pure path/merge helpers (no DOM) ---
function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}
function setByPath(obj, path, value) {
  if (!path || path === "/") return value;
  const parts = String(path).split("/").filter(Boolean);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!isObject(cur[key])) cur[key] = {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}
function deepMerge(a, b) {
  for (const [key, value] of Object.entries(b || {})) {
    if (isObject(value) && isObject(a[key])) a[key] = deepMerge(a[key], value);
    else a[key] = value;
  }
  return a;
}
