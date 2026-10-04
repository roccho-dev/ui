import { createBaseCatalog } from "./base.mjs";
import { assertExactKeys, extendTrustedCatalog, isPlainObject } from "./runtime.mjs";

export const ATLAS_STAGE_CATALOG_ID = "urn:roccho:a2ui:catalog:atlas-stage:1";
export const ATLAS_STAGE_COMPONENT = "AtlasStage";

const MAX_NODES = 96;
const MAX_EDGES = 192;
const MAX_ABS_COORDINATE = 1_000_000;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const NODE_KINDS = new Set(["actor", "data", "decision", "event", "node", "region", "step", "system"]);
const EDGE_KINDS = new Set(["association", "flow", "message", "relation"]);

const invariant = (condition, message) => {
  if (!condition) throw new Error(`a2ui-atlas-stage: ${message}`);
};
const finite = (value, name) => {
  invariant(Number.isFinite(value) && Math.abs(value) <= MAX_ABS_COORDINATE, `${name} must be a bounded finite number`);
  return value;
};
const positive = (value, name) => {
  finite(value, name);
  invariant(value > 0, `${name} must be positive`);
  return value;
};
const identifier = (value, name) => {
  invariant(typeof value === "string" && SAFE_ID.test(value), `${name} is invalid`);
  return value;
};
const label = (value, name) => {
  invariant(typeof value === "string" && value.length > 0 && value.length <= 200, `${name} is invalid`);
  return value;
};
const normalizeViewBox = value => {
  assertExactKeys(value, ["height", "width", "x", "y"], [], "AtlasStage.viewBox");
  return Object.freeze({
    height: positive(value.height, "AtlasStage.viewBox.height"),
    width: positive(value.width, "AtlasStage.viewBox.width"),
    x: finite(value.x, "AtlasStage.viewBox.x"),
    y: finite(value.y, "AtlasStage.viewBox.y"),
  });
};
const normalizeNode = (value, index) => {
  assertExactKeys(value, ["height", "id", "label", "width", "x", "y"], ["kind", "parentId"], `AtlasStage.nodes[${index}]`);
  const kind = value.kind ?? "node";
  invariant(NODE_KINDS.has(kind), `AtlasStage.nodes[${index}].kind is unsupported`);
  const node = {
    height: positive(value.height, `AtlasStage.nodes[${index}].height`),
    id: identifier(value.id, `AtlasStage.nodes[${index}].id`),
    kind,
    label: label(value.label, `AtlasStage.nodes[${index}].label`),
    width: positive(value.width, `AtlasStage.nodes[${index}].width`),
    x: finite(value.x, `AtlasStage.nodes[${index}].x`),
    y: finite(value.y, `AtlasStage.nodes[${index}].y`),
  };
  if (value.parentId !== undefined) node.parentId = identifier(value.parentId, `AtlasStage.nodes[${index}].parentId`);
  return Object.freeze(node);
};
const normalizeEdge = (value, index) => {
  assertExactKeys(value, ["from", "id", "to"], ["kind", "label"], `AtlasStage.edges[${index}]`);
  const kind = value.kind ?? "relation";
  invariant(EDGE_KINDS.has(kind), `AtlasStage.edges[${index}].kind is unsupported`);
  const edge = {
    from: identifier(value.from, `AtlasStage.edges[${index}].from`),
    id: identifier(value.id, `AtlasStage.edges[${index}].id`),
    kind,
    to: identifier(value.to, `AtlasStage.edges[${index}].to`),
  };
  if (value.label !== undefined) edge.label = label(value.label, `AtlasStage.edges[${index}].label`);
  return Object.freeze(edge);
};

const validateAtlasStage = component => {
  assertExactKeys(component, ["component", "edges", "id", "nodes", "viewBox"], ["ariaLabel"], "AtlasStage");
  invariant(Array.isArray(component.nodes) && component.nodes.length > 0 && component.nodes.length <= MAX_NODES, `AtlasStage.nodes must contain 1-${MAX_NODES} nodes`);
  invariant(Array.isArray(component.edges) && component.edges.length <= MAX_EDGES, `AtlasStage.edges must contain at most ${MAX_EDGES} edges`);
  if (component.ariaLabel !== undefined) label(component.ariaLabel, "AtlasStage.ariaLabel");
  const nodes = component.nodes.map(normalizeNode);
  const edges = component.edges.map(normalizeEdge);
  const nodeIds = new Set();
  for (const node of nodes) {
    invariant(!nodeIds.has(node.id), `AtlasStage duplicate node ${node.id}`);
    nodeIds.add(node.id);
  }
  const edgeIds = new Set();
  for (const edge of edges) {
    invariant(!edgeIds.has(edge.id), `AtlasStage duplicate edge ${edge.id}`);
    edgeIds.add(edge.id);
    invariant(nodeIds.has(edge.from), `AtlasStage edge ${edge.id} references missing ${edge.from}`);
    invariant(nodeIds.has(edge.to), `AtlasStage edge ${edge.id} references missing ${edge.to}`);
    invariant(edge.from !== edge.to, `AtlasStage edge ${edge.id} cannot be a self edge`);
  }
  for (const node of nodes) {
    if (node.parentId === undefined) continue;
    invariant(nodeIds.has(node.parentId), `AtlasStage node ${node.id} references missing parent ${node.parentId}`);
    invariant(node.parentId !== node.id, `AtlasStage node ${node.id} cannot parent itself`);
  }
  return {
    ...component,
    ...(component.ariaLabel === undefined ? {} : { ariaLabel: component.ariaLabel }),
    edges,
    nodes,
    viewBox: normalizeViewBox(component.viewBox),
  };
};

const svgElement = (document, name) => document.createElementNS
  ? document.createElementNS("http://www.w3.org/2000/svg", name)
  : document.createElement(name);
const setAttributes = (element, values) => {
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) element.setAttribute(name, String(value));
  }
  return element;
};
const center = node => Object.freeze({ x: node.x + node.width / 2, y: node.y + node.height / 2 });
const renderAtlasStage = ({ component, document }) => {
  invariant(document?.createElement, "document is required");
  const svg = setAttributes(svgElement(document, "svg"), {
    "aria-label": component.ariaLabel ?? "Canvas diagram",
    "data-atlas-edge-count": component.edges.length,
    "data-atlas-node-count": component.nodes.length,
    "data-atlas-stage": "svg",
    height: component.viewBox.height,
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    viewBox: `${component.viewBox.x} ${component.viewBox.y} ${component.viewBox.width} ${component.viewBox.height}`,
    width: component.viewBox.width,
  });
  const title = svgElement(document, "title");
  title.textContent = component.ariaLabel ?? "Canvas diagram";
  svg.append(title);

  const byId = new Map(component.nodes.map(node => [node.id, node]));
  const edgeLayer = setAttributes(svgElement(document, "g"), { "data-atlas-layer": "edges" });
  for (const edge of component.edges) {
    const from = center(byId.get(edge.from));
    const to = center(byId.get(edge.to));
    edgeLayer.append(setAttributes(svgElement(document, "line"), {
      "data-atlas-edge": edge.id,
      "data-atlas-kind": edge.kind,
      "data-from": edge.from,
      "data-to": edge.to,
      stroke: "CanvasText",
      "stroke-opacity": 0.72,
      "stroke-width": edge.kind === "message" ? 2 : 1.5,
      "stroke-dasharray": edge.kind === "association" ? "7 5" : undefined,
      "vector-effect": "non-scaling-stroke",
      x1: from.x,
      x2: to.x,
      y1: from.y,
      y2: to.y,
    }));
    if (edge.label !== undefined) {
      const text = setAttributes(svgElement(document, "text"), {
        "data-atlas-edge-label": edge.id,
        fill: "CanvasText",
        "font-size": 13,
        "text-anchor": "middle",
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2 - 7,
      });
      text.textContent = edge.label;
      edgeLayer.append(text);
    }
  }
  svg.append(edgeLayer);

  const nodeLayer = setAttributes(svgElement(document, "g"), { "data-atlas-layer": "nodes" });
  const ordered = [...component.nodes].sort((left, right) => Number(right.kind === "region") - Number(left.kind === "region"));
  for (const node of ordered) {
    const group = setAttributes(svgElement(document, "g"), {
      "data-atlas-kind": node.kind,
      "data-atlas-node": node.id,
      "data-parent": node.parentId,
    });
    group.append(setAttributes(svgElement(document, "rect"), {
      fill: node.kind === "region" ? "none" : "Canvas",
      height: node.height,
      rx: node.kind === "actor" ? Math.min(node.height / 2, 18) : 10,
      stroke: "CanvasText",
      "stroke-dasharray": node.kind === "region" ? "8 6" : undefined,
      "stroke-width": node.kind === "region" ? 1.5 : 2,
      "vector-effect": "non-scaling-stroke",
      width: node.width,
      x: node.x,
      y: node.y,
    }));
    const text = setAttributes(svgElement(document, "text"), {
      fill: "CanvasText",
      "font-size": node.kind === "region" ? 15 : 14,
      "font-weight": node.kind === "region" ? 650 : 600,
      x: node.x + 12,
      y: node.y + 22,
    });
    text.textContent = node.label;
    group.append(text);
    nodeLayer.append(group);
  }
  svg.append(nodeLayer);
  return svg;
};

const atlasDefinition = Object.freeze({
  name: ATLAS_STAGE_COMPONENT,
  validate: validateAtlasStage,
  render: renderAtlasStage,
});

let catalog = null;
export const createAtlasStageCatalog = () => {
  if (!catalog) catalog = extendTrustedCatalog({
    base: createBaseCatalog(),
    definitions: [atlasDefinition],
    id: ATLAS_STAGE_CATALOG_ID,
  });
  return catalog;
};
export const validateAtlasStageComponent = value => createAtlasStageCatalog().validateComponent(value);
