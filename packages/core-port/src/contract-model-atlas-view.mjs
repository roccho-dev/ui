import { sha256, stableJson } from "./a2ui-shell-builder.mjs";
import { FORBIDDEN_AUTHORITY_FIELDS } from "./log.mjs";

export const CONTRACT_MODEL_ATLAS_VIEW_KIND = "ui.contractModelAtlas.view.v1";
export const CONTRACT_MODEL_ATLAS_RECEIPT_KIND = "ui.contractModelAtlas.artifactReceipt.v1";

const ARRAY_FIELDS = ["containers", "elements", "edges", "edgeList", "diagnostics"];
const NUMERIC_LAYOUT_FIELDS = ["x", "y", "w", "h", "labelX", "labelY", "x1", "y1", "x2", "y2"];

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function walk(value, visit) {
  visit(value);
  if (Array.isArray(value)) for (const item of value) walk(item, visit);
  else if (isObject(value)) for (const item of Object.values(value)) walk(item, visit);
}

export function assertNoAuthorityOrHtml(value, label = "contract model atlas view") {
  walk(value, (item) => {
    if (isObject(item)) {
      for (const field of FORBIDDEN_AUTHORITY_FIELDS) {
        if (Object.hasOwn(item, field)) throw new Error(`${label}: forbidden authority field ${field}`);
      }
    }
    if (typeof item === "string" && /<\/?[a-z][^>]*>/i.test(item)) throw new Error(`${label}: raw HTML is forbidden`);
  });
  return true;
}

function assertArray(value, path) {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
}

function assertString(value, path) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${path} must be a non-empty string`);
}

function assertBooleanFalse(value, path) {
  if (value !== false) throw new Error(`${path} must be false`);
}

function assertOptionalNumber(row, field, path) {
  if (row[field] != null && typeof row[field] !== "number") throw new Error(`${path}.${field} must be a number`);
}

function assertRowId(row, path) {
  if (!isObject(row)) throw new Error(`${path} must be an object`);
  assertString(row.id, `${path}.id`);
}

function assertUniqueIds(rows, path) {
  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    assertRowId(row, `${path}[${index}]`);
    if (seen.has(row.id)) throw new Error(`${path} duplicate id: ${row.id}`);
    seen.add(row.id);
  }
  return seen;
}

export function assertContractModelAtlasView(view) {
  if (!isObject(view)) throw new Error("Contract Model Atlas view must be an object");
  if (view.kind !== CONTRACT_MODEL_ATLAS_VIEW_KIND) throw new Error(`unexpected Contract Model Atlas kind: ${view.kind}`);
  assertBooleanFalse(view.generatedArtifactsAreAuthority, "generatedArtifactsAreAuthority");
  assertBooleanFalse(view.adapterOwnsState, "adapterOwnsState");
  if (view.sourceDataLoaded !== true) throw new Error("sourceDataLoaded must be true");
  if (!isObject(view.summary)) throw new Error("summary must be an object");
  assertString(view.summary.title, "summary.title");
  assertString(view.summary.statusText, "summary.statusText");
  for (const field of ARRAY_FIELDS) assertArray(view[field], field);
  if (typeof view.treeText !== "string") throw new Error("treeText must be a string");

  const containerIds = assertUniqueIds(view.containers, "containers");
  const elementIds = assertUniqueIds(view.elements, "elements");
  const edgeIds = assertUniqueIds(view.edges, "edges");
  if (!edgeIds.size && view.edges.length) throw new Error("edge ids must be unique");

  for (const [index, row] of view.containers.entries()) {
    const path = `containers[${index}]`;
    assertString(row.label, `${path}.label`);
    for (const field of NUMERIC_LAYOUT_FIELDS) assertOptionalNumber(row, field, path);
    if (row.parentId != null && !containerIds.has(row.parentId)) throw new Error(`${path}.parentId references unknown container: ${row.parentId}`);
  }

  for (const [index, row] of view.elements.entries()) {
    const path = `elements[${index}]`;
    assertString(row.label, `${path}.label`);
    for (const field of NUMERIC_LAYOUT_FIELDS) assertOptionalNumber(row, field, path);
    if (row.containerId != null && !containerIds.has(row.containerId)) throw new Error(`${path}.containerId references unknown container: ${row.containerId}`);
  }

  const targetIds = new Set([...containerIds, ...elementIds]);
  for (const [index, row] of view.edges.entries()) {
    const path = `edges[${index}]`;
    assertString(row.from, `${path}.from`);
    assertString(row.to, `${path}.to`);
    assertString(row.label, `${path}.label`);
    if (!targetIds.has(row.from)) throw new Error(`${path}.from references unknown node: ${row.from}`);
    if (!targetIds.has(row.to)) throw new Error(`${path}.to references unknown node: ${row.to}`);
    for (const field of NUMERIC_LAYOUT_FIELDS) assertOptionalNumber(row, field, path);
  }

  assertNoAuthorityOrHtml(view);
  return view;
}

export function normalizeContractModelAtlasView(view) {
  return clone(assertContractModelAtlasView(view));
}

export function contractModelAtlasDigest(view) {
  return sha256(normalizeContractModelAtlasView(view));
}

export function makeContractModelAtlasDataRow({ surfaceId, atlas }) {
  assertString(surfaceId, "surfaceId");
  const view = normalizeContractModelAtlasView(atlas);
  return {
    version: "v0.9",
    updateDataModel: {
      surfaceId,
      path: "/atlas",
      value: view,
    },
  };
}

export function makeContractModelAtlasReceipt({ surfaceId, shellDigest, dataDigest, htmlDigest, viewDigest, files = [] }) {
  assertString(surfaceId, "surfaceId");
  for (const [key, value] of Object.entries({ shellDigest, dataDigest, htmlDigest, viewDigest })) {
    assertString(value, key);
  }
  const receipt = {
    kind: CONTRACT_MODEL_ATLAS_RECEIPT_KIND,
    status: "PASS",
    surfaceId,
    shellDigest,
    dataDigest,
    htmlDigest,
    viewDigest,
    files: files.slice().sort(),
    adapterOwnsState: false,
    generatedArtifactsAreAuthority: false,
    authority: false,
    note: "Contract Model Atlas artifact is replayable build evidence only.",
  };
  return { ...receipt, receiptDigest: sha256(stableJson(receipt)) };
}
