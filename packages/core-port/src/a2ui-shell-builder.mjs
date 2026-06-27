import crypto from "node:crypto";

export const GENERIC_A2UI_BUILDER_VERSION = "generic-a2ui-shell-builder.v1";

const STRUCTURE_KINDS = ["createSurface", "updateComponents"];
const MESSAGE_KINDS = [...STRUCTURE_KINDS, "updateDataModel"];
const FORBIDDEN_AUTHORITY_FIELDS = new Set([
  "approval",
  "approvalStatus",
  "canonicalState",
  "fireAuthorization",
  "mergeApproval",
  "mergeReady",
]);

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

export function jsonlLines(rows) {
  return rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
}

export function parseJsonlLines(text) {
  return String(text || "").trim().split(/\n+/).filter(Boolean).map((line) => JSON.parse(line));
}

export function messageKind(row) {
  const kinds = MESSAGE_KINDS.filter((key) => Object.hasOwn(row, key));
  if (kinds.length !== 1) throw new Error(`A2UI row must contain exactly one message kind: ${JSON.stringify(kinds)}`);
  return kinds[0];
}

function walk(value, visit) {
  visit(value);
  if (Array.isArray(value)) for (const item of value) walk(item, visit);
  else if (value && typeof value === "object") for (const item of Object.values(value)) walk(item, visit);
}

export function assertNoAuthorityOrHtml(value, label = "value") {
  walk(value, (item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      for (const key of Object.keys(item)) {
        if (FORBIDDEN_AUTHORITY_FIELDS.has(key)) throw new Error(`${label}: forbidden authority field ${key}`);
      }
    }
    if (typeof item === "string" && /<\/?[a-z][^>]*>/i.test(item)) throw new Error(`${label}: raw HTML is forbidden`);
  });
}

function collectPathBindings(value, out = new Set()) {
  walk(value, (item) => {
    if (item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).length === 1 && typeof item.path === "string") {
      out.add(item.path);
    }
  });
  return [...out].sort();
}

function assertSameSet(actual, expected, label) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  if (stableJson(a) !== stableJson(e)) throw new Error(`${label}: expected ${stableJson(e)} got ${stableJson(a)}`);
}

export function validateShellRows(rows, contract) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("shell rows are required");
  const kinds = rows.map(messageKind);
  if (kinds.includes("updateDataModel")) throw new Error("shell must not contain data messages");
  if (kinds.filter((kind) => kind === "createSurface").length !== 1) throw new Error("shell requires exactly one createSurface");
  if (!kinds.includes("updateComponents")) throw new Error("shell requires updateComponents");
  const surfaceIds = new Set(rows.map((row) => row.createSurface?.surfaceId || row.updateComponents?.surfaceId).filter(Boolean));
  assertSameSet(surfaceIds, [contract.surfaceId], "shell surfaceId");
  for (const row of rows) assertNoAuthorityOrHtml(row, "shell");
  assertSameSet(collectPathBindings(rows), contract.requiredBindingPaths || [], "shell binding paths");
  return true;
}

export function compileShell(rows, contract) {
  validateShellRows(rows, contract);
  const create = rows.find((row) => row.createSurface).createSurface;
  const components = rows.flatMap((row) => row.updateComponents?.components || []);
  const shell = {
    kind: "ui.a2ui.compiled-shell.v1",
    builder: GENERIC_A2UI_BUILDER_VERSION,
    protocolVersion: create.protocolVersion || rows[0].version || "v0.9",
    surfaceId: create.surfaceId,
    catalogId: create.catalogId,
    components,
    bindings: [...(contract.requiredBindingPaths || [])].sort(),
    generatedArtifactsAreAuthority: false,
  };
  return { ...shell, shellDigest: sha256(shell) };
}

export function validateDataCartridgeRows(rows, contract) {
  if (!Array.isArray(rows)) throw new Error("data rows must be an array");
  const allowed = new Set(contract.allowedUpdatePaths || contract.requiredBindingPaths || []);
  for (const row of rows) {
    if (messageKind(row) !== "updateDataModel") throw new Error("data cartridge may contain only updateDataModel");
    const msg = row.updateDataModel;
    if (msg.surfaceId !== contract.surfaceId) throw new Error("data surfaceId must match contract");
    if (msg.path === "/") throw new Error("root updateDataModel is forbidden");
    if (!allowed.has(msg.path)) throw new Error(`data path not declared: ${msg.path}`);
    assertNoAuthorityOrHtml(msg.value, "data");
  }
  return true;
}

export function applyDataCartridge(rows, contract) {
  validateDataCartridgeRows(rows, contract);
  let state = {};
  for (const row of rows) state = setJsonPointer(state, row.updateDataModel.path, row.updateDataModel.value);
  return state;
}

function setJsonPointer(state, pointer, value) {
  const out = structuredClone(state);
  const keys = pointer.split("/").filter(Boolean);
  let target = out;
  for (const key of keys.slice(0, -1)) target = target[key] ??= {};
  target[keys.at(-1)] = structuredClone(value);
  return out;
}

function getJsonPointer(state, pointer) {
  let current = state;
  for (const key of pointer.split("/").filter(Boolean)) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[key];
  }
  return current;
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function readBinding(props = {}, key, state) {
  const binding = props[key];
  if (binding && typeof binding === "object" && typeof binding.path === "string") return getJsonPointer(state, binding.path);
  return binding;
}

function renderComponent(component, state) {
  const type = component.component;
  const props = component.props || {};
  if (type === "Text") return `<section class="a2ui-component a2ui-text" data-component-id="${escapeHtml(component.id)}"><p>${escapeHtml(readBinding(props, "text", state))}</p></section>`;
  if (type === "List") {
    const rows = readBinding(props, "rows", state);
    const items = Array.isArray(rows) ? rows : [];
    return `<section class="a2ui-component a2ui-list" data-component-id="${escapeHtml(component.id)}"><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`;
  }
  if (type === "Card") {
    const title = escapeHtml(readBinding(props, "title", state));
    const body = escapeHtml(readBinding(props, "body", state));
    return `<article class="a2ui-component a2ui-card" data-component-id="${escapeHtml(component.id)}"><h2>${title}</h2><p>${body}</p></article>`;
  }
  throw new Error(`unsupported generic component: ${type}`);
}

export function renderShellHtml(shell, state = {}, options = {}) {
  const title = options.title || shell.surfaceId;
  const body = shell.components.map((component) => renderComponent(component, state)).join("\n");
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escapeHtml(title)}</title>\n<style>body{font-family:system-ui,sans-serif;margin:2rem;line-height:1.5}.a2ui-component{border:1px solid #ddd;border-radius:12px;padding:1rem;margin:1rem 0}.meta{font-size:.875rem;color:#555}</style>\n</head>\n<body>\n<header><h1>${escapeHtml(title)}</h1><p class="meta">Generated from A2UI shell. generatedArtifactsAreAuthority=false</p></header>\n<main>\n${body}\n</main>\n</body>\n</html>\n`;
}

export function makeGenericA2uiFixture() {
  const contract = {
    surfaceId: "generic-a2ui-shell-preview",
    requiredBindingPaths: ["/items", "/status", "/title", "/summary"],
    allowedUpdatePaths: ["/items", "/status", "/title", "/summary"],
  };
  const shellRows = [
    { version: "v0.9", createSurface: { surfaceId: contract.surfaceId, catalogId: "ui.generic.preview.catalog.v1", protocolVersion: "v0.9" } },
    { version: "v0.9", updateComponents: { surfaceId: contract.surfaceId, components: [
      { id: "title", component: "Text", props: { text: { path: "/title" } } },
      { id: "summary", component: "Card", props: { title: "Summary", body: { path: "/summary" } } },
      { id: "items", component: "List", props: { rows: { path: "/items" } } },
      { id: "status", component: "Text", props: { text: { path: "/status" } } },
    ] } },
  ];
  const dataA = [
    { version: "v0.9", updateDataModel: { surfaceId: contract.surfaceId, path: "/title", value: "Generic A2UI shell" } },
    { version: "v0.9", updateDataModel: { surfaceId: contract.surfaceId, path: "/summary", value: "Data cartridge A is attached after shell build." } },
    { version: "v0.9", updateDataModel: { surfaceId: contract.surfaceId, path: "/items", value: ["shell build", "data cartridge", "generated HTML"] } },
    { version: "v0.9", updateDataModel: { surfaceId: contract.surfaceId, path: "/status", value: "preview A" } },
  ];
  const dataB = structuredClone(dataA);
  dataB[1].updateDataModel.value = "Data cartridge B changes data only.";
  dataB[2].updateDataModel.value = ["same shell", "different data", "different preview"];
  dataB[3].updateDataModel.value = "preview B";
  return { contract, shellRows, dataA, dataB };
}

export function buildGenericA2uiPreview() {
  const { contract, shellRows, dataA, dataB } = makeGenericA2uiFixture();
  return buildGenericA2uiPreviewFromRows(contract, shellRows, dataA, dataB);
}

export function buildGenericA2uiPreviewFromJsonl({ contract, shellJsonl, dataAJsonl, dataBJsonl }) {
  return buildGenericA2uiPreviewFromRows(
    contract,
    parseJsonlLines(shellJsonl),
    parseJsonlLines(dataAJsonl),
    parseJsonlLines(dataBJsonl),
  );
}

export function buildGenericA2uiPreviewFromRows(contract, shellRows, dataA, dataB) {
  const shell = compileShell(shellRows, contract);
  const stateA = applyDataCartridge(dataA, contract);
  const stateB = applyDataCartridge(dataB, contract);
  const shellHtml = renderShellHtml(shell, {}, { title: "Generic A2UI shell - no data" });
  const previewAHtml = renderShellHtml(shell, stateA, { title: "Generic A2UI shell - preview A" });
  const previewBHtml = renderShellHtml(shell, stateB, { title: "Generic A2UI shell - preview B" });
  const receipt = {
    kind: "ui.generic-a2ui-preview.receipt.v1",
    status: "PASS",
    builder: GENERIC_A2UI_BUILDER_VERSION,
    surfaceId: shell.surfaceId,
    shellDigest: shell.shellDigest,
    dataADigest: sha256(stateA),
    dataBDigest: sha256(stateB),
    shellHtmlDigest: sha256(shellHtml),
    previewAHtmlDigest: sha256(previewAHtml),
    previewBHtmlDigest: sha256(previewBHtml),
    generatedArtifactsAreAuthority: false,
  };
  if (receipt.dataADigest === receipt.dataBDigest) throw new Error("data digests must differ");
  if (receipt.previewAHtmlDigest === receipt.previewBHtmlDigest) throw new Error("preview digests must differ");
  return { contract, shellRows, dataA, dataB, shell, stateA, stateB, shellHtml, previewAHtml, previewBHtml, receipt };
}
