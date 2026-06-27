import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defaultRegistry, purposeAtlasHtmlBox } from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const previewPackageRoot = path.join(root, "packages/purpose-atlas-preview");
const fixtureRoot = path.join(root, "tests/fixtures/purpose-atlas");
const referenceRoot = path.join(root, "tests/reference/purpose-atlas-source");
const atlasDocsRoot = path.join(root, "docs/purpose-atlas-v6-a2ui");
const surfacePath = path.join(fixtureRoot, "surface.v0.9.jsonl");
const atlasDataPath = path.join(fixtureRoot, "atlas-data.json");
const dataContractPath = path.join(atlasDocsRoot, "A2UI-DATA-CONTRACT.md");
const atlasReadmePath = path.join(atlasDocsRoot, "README.md");
const sourceLockPath = path.join(referenceRoot, "SOURCE_LOCK.json");
const sourceRoot = path.join(referenceRoot, "source");

const contractPhrases = [
  "ADRS projected input",
  "adrs projected input",
  "core+port as lib",
  "a2ui as build",
  "jsonl as attached data",
  "stateless",
  "non-authoritative",
  "ui.git is not a state store",
];

const forbiddenAuthorityFields = [
  "approval",
  "approvalStatus",
  "canonicalState",
  "mergeReady",
  "authorizesFire",
  "authorizesMerge",
  "ownerDecisionAccepted",
  "decisionAccepted",
];

function assertContainsPhrases(label, text, phrases) {
  for (const phrase of phrases) assert.ok(text.includes(phrase), `${label} must contain ${phrase}`);
}

function assertNoForbiddenKeys(label, value, trail = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(label, item, [...trail, index]));
    return;
  }
  for (const key of Object.keys(value)) {
    assert.ok(!forbiddenAuthorityFields.includes(key), `${label} must not assert authority field ${[...trail, key].join(".")}`);
    assertNoForbiddenKeys(label, value[key], [...trail, key]);
  }
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const html = fs.readFileSync(path.join(previewPackageRoot, "index.html"), "utf8");
assert.match(html, /Purpose Decision Atlas v6/);
assert.match(html, /purpose-atlas-app/);
assert.doesNotMatch(html, /need-zoom-purpose-lineage/);

const rootReadme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const atlasReadme = fs.readFileSync(atlasReadmePath, "utf8");
const dataContract = fs.readFileSync(dataContractPath, "utf8");
assertContainsPhrases("root README", rootReadme, contractPhrases);
assertContainsPhrases("Purpose Atlas README", atlasReadme, contractPhrases);
assertContainsPhrases("Purpose Atlas data contract", dataContract, contractPhrases);
assert.match(dataContract, /inputAuthority: external to ui\.git/);
assert.match(dataContract, /replaceable by ADRS\s+projected input/);
assert.match(dataContract, /runtime behavior only/);

const surfaceText = fs.readFileSync(surfacePath, "utf8");
const surfaceLines = surfaceText.trim().split(/\n+/).map((line) => JSON.parse(line));
assert.equal(surfaceLines[0].version, "v0.9");
assert.equal(surfaceLines[0].createSurface.surfaceId, "purpose-atlas");
assert.equal(surfaceLines[0].createSurface.sendDataModel, true);
const components = surfaceLines.find((line) => line.updateComponents)?.updateComponents.components || [];
assert.equal(components.length, 1);
assert.equal(components[0].component, "AtlasSourceSurface");
const actionNames = Object.entries(components[0])
  .filter(([key, value]) => key.startsWith("on") && value?.event?.name)
  .map(([, value]) => value.event.name)
  .sort();
assert.deepEqual(actionNames, [
  "atlas.clearSelection",
  "atlas.fit",
  "atlas.holdDecision",
  "atlas.modeChanged",
  "atlas.next",
  "atlas.previous",
  "atlas.recordMismatch",
  "atlas.requestOwner",
  "atlas.reset",
  "atlas.select",
  "atlas.stepChanged",
  "atlas.stepForward",
  "atlas.togglePlay",
  "atlas.zoomIn",
  "atlas.zoomOut",
].sort());
assert.doesNotMatch(surfaceText, /functionCall|<script|innerHTML|eval\(/);
assert.ok(!surfaceLines.some((line) => line.updateDataModel), "surface fixture must be shell/input only");
assertNoForbiddenKeys("Purpose Atlas A2UI surface JSONL", surfaceLines);

const atlasData = JSON.parse(fs.readFileSync(atlasDataPath, "utf8"));
assertNoForbiddenKeys("Purpose Atlas fixture data", atlasData);

const sourceLock = JSON.parse(fs.readFileSync(sourceLockPath, "utf8"));
for (const [file, expected] of Object.entries(sourceLock.sourceFilesSha256)) {
  assert.equal(sha256File(path.join(sourceRoot, file)), expected, `source reference digest must match lock for ${file}`);
}

const registry = defaultRegistry();
const atlasEntry = registry.get("AtlasSourceSurface");
assert.equal(atlasEntry.family, "purpose_atlas");
assert.equal(atlasEntry.childrenPolicy, "none");
assert.ok(atlasEntry.actions.includes("atlas.recordMismatch"));
assert.equal(purposeAtlasHtmlBox.accepts, "a2ui.surface.v0.9");
assert.deepEqual(purposeAtlasHtmlBox.assets, ["index.html"]);

assert.equal(fs.existsSync(path.join(previewPackageRoot, "dist")), false, "generated dist must not be tracked as package authority");
assert.equal(fs.existsSync(path.join(previewPackageRoot, "evidence")), false, "generated evidence must not be tracked as package authority");
assert.equal(fs.existsSync(path.join(previewPackageRoot, "MANIFEST.sha256")), false, "generated manifest must not be tracked as package authority");

console.log(JSON.stringify({
  status: "purpose-atlas-a2ui-check-pass",
  surface: "purpose-atlas",
  component: "AtlasSourceSurface",
  actions: actionNames.length,
}, null, 2));
