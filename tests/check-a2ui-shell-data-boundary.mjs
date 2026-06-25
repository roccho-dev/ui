import assert from "node:assert/strict";
import crypto from "node:crypto";

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash("sha256").update(stable(value)).digest("hex");
}

function messageKind(row) {
  const kinds = ["createSurface", "updateComponents", "updateDataModel"].filter((key) => Object.hasOwn(row, key));
  assert.equal(kinds.length, 1, "A2UI row must contain exactly one message kind");
  return kinds[0];
}

function walk(value, visit) {
  visit(value);
  if (Array.isArray(value)) for (const item of value) walk(item, visit);
  else if (value && typeof value === "object") for (const item of Object.values(value)) walk(item, visit);
}

function assertNoAuthorityOrHtml(value, label) {
  const forbidden = new Set(["approval", "canonicalState", "mergeApproval", "mergeReady"]);
  walk(value, (item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      for (const key of Object.keys(item)) assert.ok(!forbidden.has(key), `${label}: forbidden authority field ${key}`);
    }
    if (typeof item === "string") assert.ok(!/<\/?[a-z][^>]*>/i.test(item), `${label}: raw HTML is forbidden`);
  });
}

function collectBindingPaths(rows) {
  const paths = new Set();
  for (const row of rows) {
    if (!row.updateComponents) continue;
    walk(row.updateComponents.components, (item) => {
      if (item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).length === 1 && typeof item.path === "string") paths.add(item.path);
    });
  }
  return [...paths].sort();
}

function validateShell(rows, contract) {
  const kinds = rows.map(messageKind);
  assert.ok(!kinds.includes("updateDataModel"), "shell must not contain data messages");
  assert.equal(kinds.filter((kind) => kind === "createSurface").length, 1, "shell requires exactly one createSurface");
  assert.ok(kinds.includes("updateComponents"), "shell requires updateComponents");
  const surfaceIds = new Set(rows.map((row) => row.createSurface?.surfaceId || row.updateComponents?.surfaceId).filter(Boolean));
  assert.deepEqual([...surfaceIds], [contract.surfaceId], "shell surfaceId must match data contract");
  for (const row of rows) assertNoAuthorityOrHtml(row, "shell");
  assert.deepEqual(collectBindingPaths(rows), contract.requiredBindingPaths.slice().sort(), "shell bindings must equal data contract paths");
}

function validateData(rows, contract) {
  const allowed = new Set(contract.allowedUpdatePaths);
  for (const row of rows) {
    assert.equal(messageKind(row), "updateDataModel", "data cartridge may contain only updateDataModel");
    const msg = row.updateDataModel;
    assert.equal(msg.surfaceId, contract.surfaceId, "data surfaceId must match contract");
    assert.notEqual(msg.path, "/", "root updateDataModel is forbidden");
    assert.ok(allowed.has(msg.path), `data path not declared: ${msg.path}`);
    assertNoAuthorityOrHtml(msg.value, "data");
  }
}

function compileShell(rows, contract) {
  validateShell(rows, contract);
  const create = rows.find((row) => row.createSurface).createSurface;
  const shell = {
    kind: "ui.a2ui.shell.v1",
    protocolVersion: "v0.9",
    surfaceId: create.surfaceId,
    catalogId: create.catalogId,
    components: rows.flatMap((row) => row.updateComponents?.components || []),
    bindings: contract.requiredBindingPaths.slice().sort(),
    generatedArtifactsAreAuthority: false,
  };
  return { ...shell, shellDigest: digest(shell) };
}

function setPath(state, pointer, value) {
  const out = structuredClone(state);
  const keys = pointer.split("/").filter(Boolean);
  let target = out;
  for (const key of keys.slice(0, -1)) target = target[key] ??= {};
  target[keys.at(-1)] = structuredClone(value);
  return out;
}

function applyData(rows, contract) {
  validateData(rows, contract);
  let state = {};
  for (const row of rows) state = setPath(state, row.updateDataModel.path, row.updateDataModel.value);
  return state;
}

const contract = {
  surfaceId: "a2ui-shell-data-boundary-probe",
  requiredBindingPaths: ["/items", "/status", "/title"],
  allowedUpdatePaths: ["/items", "/status", "/title"],
};

const shellRows = [
  { version: "v0.9", createSurface: { surfaceId: contract.surfaceId, catalogId: "ui-preview-catalog" } },
  { version: "v0.9", updateComponents: { surfaceId: contract.surfaceId, components: [
    { id: "title", component: "Text", props: { text: { path: "/title" } } },
    { id: "items", component: "List", props: { rows: { path: "/items" } } },
    { id: "status", component: "Text", props: { text: { path: "/status" } } },
  ] } },
];

const dataA = [
  { version: "v0.9", updateDataModel: { surfaceId: contract.surfaceId, path: "/title", value: "A2UI shell" } },
  { version: "v0.9", updateDataModel: { surfaceId: contract.surfaceId, path: "/items", value: ["empty-build", "data-cartridge"] } },
  { version: "v0.9", updateDataModel: { surfaceId: contract.surfaceId, path: "/status", value: "draft" } },
];
const dataB = structuredClone(dataA);
dataB[0].updateDataModel.value = "A2UI shell changed data only";
dataB[2].updateDataModel.value = "review";

const shellA = compileShell(shellRows, contract);
const shellB = compileShell(shellRows, contract);
assert.equal(shellA.shellDigest, shellB.shellDigest, "same shell input must produce stable shell digest");
const emptyStateDigest = digest({ shellDigest: shellA.shellDigest, state: {} });
const stateA = applyData(dataA, contract);
const stateB = applyData(dataB, contract);
assert.equal(shellA.shellDigest, compileShell(shellRows, contract).shellDigest, "data must not affect shell digest");
assert.notEqual(digest(stateA), digest(stateB), "data changes must change data digest");
assert.notEqual(digest({ shellDigest: shellA.shellDigest, state: stateA }), digest({ shellDigest: shellA.shellDigest, state: stateB }), "data changes must change preview digest");
assert.ok(emptyStateDigest, "empty shell state must be renderable without data");

assert.throws(() => validateShell([...shellRows, dataA[0]], contract), /shell must not contain data messages/);
assert.throws(() => validateData([{ version: "v0.9", updateComponents: { surfaceId: contract.surfaceId, components: [] } }], contract), /only updateDataModel/);
assert.throws(() => validateData([{ version: "v0.9", updateDataModel: { surfaceId: contract.surfaceId, path: "/", value: {} } }], contract), /root updateDataModel/);
assert.throws(() => validateData([{ version: "v0.9", updateDataModel: { surfaceId: contract.surfaceId, path: "/unknown", value: "x" } }], contract), /not declared/);
const rawHtml = "<" + "b>unsafe</" + "b>";
assert.throws(() => validateData([{ version: "v0.9", updateDataModel: { surfaceId: contract.surfaceId, path: "/title", value: rawHtml } }], contract), /raw HTML/);
assert.throws(() => validateData([{ version: "v0.9", updateDataModel: { surfaceId: contract.surfaceId, path: "/status", value: { mergeReady: true } } }], contract), /authority field/);

console.log(JSON.stringify({
  status: "PASS",
  schema: "ui.a2ui.shell-data-design-invariants.v1",
  shellDigest: shellA.shellDigest,
  dataADigest: digest(stateA),
  dataBDigest: digest(stateB),
  generatedArtifactsAreAuthority: false,
}, null, 2));
