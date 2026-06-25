import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  applyDataCartridge,
  buildGenericA2uiPreview,
  compileShell,
  makeGenericA2uiFixture,
  renderShellHtml,
  validateDataCartridgeRows,
  validateShellRows,
} from "../src/a2ui-shell-builder.mjs";

const { contract, shellRows, dataA, dataB } = makeGenericA2uiFixture();

assert.equal(validateShellRows(shellRows, contract), true);
assert.equal(validateDataCartridgeRows(dataA, contract), true);
assert.equal(validateDataCartridgeRows(dataB, contract), true);

const shell = compileShell(shellRows, contract);
const shellAgain = compileShell(shellRows, contract);
assert.equal(shell.shellDigest, shellAgain.shellDigest);

const stateA = applyDataCartridge(dataA, contract);
const stateB = applyDataCartridge(dataB, contract);
const shellHtml = renderShellHtml(shell, {}, { title: "no data" });
const previewAHtml = renderShellHtml(shell, stateA, { title: "preview A" });
const previewBHtml = renderShellHtml(shell, stateB, { title: "preview B" });

assert.ok(shellHtml.includes("Generated from A2UI shell"));
assert.ok(previewAHtml.includes("preview A"));
assert.ok(previewBHtml.includes("preview B"));
assert.notEqual(previewAHtml, previewBHtml);

assert.throws(() => validateShellRows([...shellRows, dataA[0]], contract), /shell must not contain data messages/);
assert.throws(() => validateDataCartridgeRows([{ version: "v0.9", updateComponents: { surfaceId: contract.surfaceId, components: [] } }], contract), /only updateDataModel/);
assert.throws(() => validateDataCartridgeRows([{ version: "v0.9", updateDataModel: { surfaceId: contract.surfaceId, path: "/", value: {} } }], contract), /root updateDataModel/);
assert.throws(() => validateDataCartridgeRows([{ version: "v0.9", updateDataModel: { surfaceId: contract.surfaceId, path: "/unknown", value: "x" } }], contract), /not declared/);

const built = buildGenericA2uiPreview();
assert.equal(built.receipt.status, "PASS");
assert.equal(built.receipt.generatedArtifactsAreAuthority, false);
assert.notEqual(built.receipt.dataADigest, built.receipt.dataBDigest);
assert.notEqual(built.receipt.previewAHtmlDigest, built.receipt.previewBHtmlDigest);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "generic-a2ui-preview-"));
fs.writeFileSync(path.join(tmp, "index.html"), built.previewAHtml, "utf8");
assert.ok(fs.existsSync(path.join(tmp, "index.html")));

console.log(JSON.stringify({
  status: "generic-a2ui-shell-builder-check-pass",
  shellDigest: shell.shellDigest,
  filesChecked: 1,
}, null, 2));
