import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defaultRegistry, purposeAtlasHtmlBox } from "#core-port";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "packages/purpose-atlas-preview");
const goldenRoot = path.join(root, "tests/fixtures/purpose-atlas-v6-a2ui/golden");
const atlasDocsRoot = path.join(root, "docs/purpose-atlas-v6-a2ui");
const surfacePath = path.join(appRoot, "public/a2ui/purpose-atlas.surface.jsonl");
const atlasDataPath = path.join(appRoot, "src/data/atlas-data.json");
const dataContractPath = path.join(atlasDocsRoot, "A2UI-DATA-CONTRACT.md");
const atlasReadmePath = path.join(atlasDocsRoot, "README.md");
const goldenLockPath = path.join(goldenRoot, "GOLDEN_LOCK.json");

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
  for (const phrase of phrases) {
    assert.ok(text.includes(phrase), `${label} must contain ${phrase}`);
  }
}

function assertNoForbiddenKeys(label, value, trail = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(label, item, [...trail, index]));
    return;
  }
  for (const key of Object.keys(value)) {
    assert.ok(
      !forbiddenAuthorityFields.includes(key),
      `${label} must not assert authority field ${[...trail, key].join(".")}`,
    );
    assertNoForbiddenKeys(label, value[key], [...trail, key]);
  }
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function collectFiles(dir, prefix = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(full, relative) : [relative];
  });
}

const html = fs.readFileSync(path.join(appRoot, "index.html"), "utf8");
assert.match(html, /Purpose Decision Atlas v6/);
assert.match(html, /purpose-atlas-app/);
assert.match(html, /src\/main\.js/);
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
assertNoForbiddenKeys("Purpose Atlas A2UI surface JSONL", surfaceLines);

const atlasData = JSON.parse(fs.readFileSync(atlasDataPath, "utf8"));
assertNoForbiddenKeys("Purpose Atlas preview data", atlasData);

const goldenLock = JSON.parse(fs.readFileSync(goldenLockPath, "utf8"));
for (const [file, expected] of Object.entries(goldenLock.sourceFilesSha256)) {
  assert.equal(
    sha256File(path.join(goldenRoot, "source", file)),
    expected,
    `golden fixture source digest must match lock for ${file}`,
  );
}

const registry = defaultRegistry();
const atlasEntry = registry.get("AtlasSourceSurface");
assert.equal(atlasEntry.family, "purpose_atlas");
assert.equal(atlasEntry.childrenPolicy, "none");
assert.ok(atlasEntry.actions.includes("atlas.recordMismatch"));
assert.equal(purposeAtlasHtmlBox.accepts, "a2ui.surface.v0.9");
assert.deepEqual(purposeAtlasHtmlBox.assets, ["index.html"]);

assert.equal(fs.existsSync(path.join(appRoot, "dist")), false, "generated dist must not be tracked as package authority");
assert.equal(fs.existsSync(path.join(appRoot, "evidence")), false, "generated evidence must not be tracked as package authority");
assert.equal(fs.existsSync(path.join(appRoot, "MANIFEST.sha256")), false, "generated manifest must not be tracked as package authority");

const appFiles = collectFiles(appRoot);
assert.deepEqual(
  appFiles.filter((file) => file.toLowerCase().endsWith(".png")),
  [],
  "Purpose Atlas preview evidence must remain HTML/JSONL based and must not depend on PNG artifacts",
);
assert.equal(fs.existsSync(path.join(root, "tests/fixtures/purpose-atlas-v6-a2ui/package.json")), false, "fixtures must not contain a buildable app package");
assert.equal(fs.existsSync(path.join(root, "tests/fixtures/purpose-atlas-v6-a2ui/vite.config.js")), false, "fixtures must not contain Vite app config");

console.log(JSON.stringify({
  status: "purpose-atlas-a2ui-check-pass",
  surface: "purpose-atlas",
  component: "AtlasSourceSurface",
  actions: actionNames.length,
}, null, 2));
