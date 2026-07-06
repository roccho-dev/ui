import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyDataCartridge,
  compileShell,
  parseJsonlLines,
  validateDataCartridgeRows,
  validateShellRows,
} from "#core-port/a2ui-shell-builder";
import {
  assertContractModelAtlasView,
  contractModelAtlasDigest,
  makeContractModelAtlasDataRow,
  normalizeContractModelAtlasView,
} from "#core-port/contract-model-atlas-view";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(root, "tests", "fixtures", "contract-model-atlas");

const contract = JSON.parse(read("contract.json"));
const shellRows = parseJsonlLines(read("shell.v0.9.jsonl"));
const dataRows = parseJsonlLines(read("data.contract-model-atlas.v1.jsonl"));

assert.equal(validateShellRows(shellRows, contract), true);
assert.equal(validateDataCartridgeRows(dataRows, contract), true);
assert.equal(shellRows.some((row) => row.updateDataModel), false, "shell must not contain data messages");
assert.deepEqual([...new Set(dataRows.map((row) => row.updateDataModel.path))], ["/atlas"], "data may update only /atlas");

const shellA = compileShell(shellRows, contract);
const shellB = compileShell(shellRows, contract);
assert.equal(shellA.shellDigest, shellB.shellDigest, "shell digest must be stable");

const stateA = applyDataCartridge(dataRows, contract);
const atlasA = assertContractModelAtlasView(stateA.atlas);
const normalized = normalizeContractModelAtlasView(atlasA);
assert.equal(normalized.kind, "ui.contractModelAtlas.view.v1");
assert.equal(normalized.generatedArtifactsAreAuthority, false);
assert.equal(normalized.adapterOwnsState, false);
assert.ok(normalized.containers.length >= 1);
assert.ok(normalized.elements.length >= 1);
assert.ok(normalized.edges.length >= 1);
assert.ok(normalized.edgeList.some((row) => row.includes("data-only")));
assert.ok(normalized.diagnostics.some((row) => row.includes("evidence only")));

const digestA = contractModelAtlasDigest(atlasA);
const digestAgain = contractModelAtlasDigest(normalized);
assert.equal(digestA, digestAgain, "view digest must be deterministic");

const mutatedAtlas = structuredClone(atlasA);
mutatedAtlas.summary.statusText = "schemas=2 fields=4 queries=2 fixtures=2 deprecated=0";
const mutatedRow = makeContractModelAtlasDataRow({ surfaceId: contract.surfaceId, atlas: mutatedAtlas });
const stateB = applyDataCartridge([mutatedRow], contract);
assert.notEqual(contractModelAtlasDigest(stateA.atlas), contractModelAtlasDigest(stateB.atlas), "data-only view change must alter view digest");
assert.equal(compileShell(shellRows, contract).shellDigest, shellA.shellDigest, "data-only view change must not alter shell digest");

assert.throws(() => validateDataCartridgeRows([{ version: "v0.9", updateDataModel: { surfaceId: contract.surfaceId, path: "/", value: {} } }], contract), /root updateDataModel/);
assert.throws(() => validateDataCartridgeRows([{ version: "v0.9", updateDataModel: { surfaceId: contract.surfaceId, path: "/unknown", value: {} } }], contract), /not declared/);
assert.throws(() => validateDataCartridgeRows([{ version: "v0.9", updateDataModel: { surfaceId: contract.surfaceId, path: "/atlas", value: { ...atlasA, summary: { ...atlasA.summary, title: "<b>bad</b>" } } } }], contract), /raw HTML/);
assert.throws(() => assertContractModelAtlasView({ ...atlasA, mergeReady: true }), /forbidden authority field/);
assert.throws(() => assertContractModelAtlasView({ ...atlasA, generatedArtifactsAreAuthority: true }), /must be false/);
assert.throws(() => assertContractModelAtlasView({ ...atlasA, adapterOwnsState: true }), /must be false/);

console.log(JSON.stringify({
  status: "contract-model-atlas-view-check-pass",
  surfaceId: contract.surfaceId,
  shellDigest: shellA.shellDigest,
  viewDigest: digestA,
  generatedArtifactsAreAuthority: false,
}, null, 2));

function read(name) {
  return fs.readFileSync(path.join(fixtureRoot, name), "utf8");
}
