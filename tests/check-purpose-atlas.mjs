import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defaultRegistry, purposeAtlasHtmlBox } from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const atlasRoot = path.join(root, "tests/fixtures/purpose-atlas-v6-a2ui");
const atlasDocsRoot = path.join(root, "docs/purpose-atlas-v6-a2ui");
const surfacePath = path.join(atlasRoot, "public/a2ui/purpose-atlas.surface.jsonl");
const atlasDataPath = path.join(atlasRoot, "src/data/atlas-data.json");
const dataContractPath = path.join(atlasDocsRoot, "A2UI-DATA-CONTRACT.md");
const atlasReadmePath = path.join(atlasDocsRoot, "README.md");
const goldenLockPath = path.join(atlasRoot, "golden/GOLDEN_LOCK.json");
const packagePath = path.join(atlasRoot, "package.json");
const packageEntryPath = path.join(atlasRoot, "registry/index.html");

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
    if (!prefix && entry.isDirectory() && ["node_modules", "dist", "evidence"].includes(entry.name)) return [];
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(full, relative) : [relative];
  });
}

const html = fs.readFileSync(packageEntryPath, "utf8");
assert.match(html, /UI component registry/);
assert.match(html, /purpose-atlas-app/);
assert.doesNotMatch(html, /need-zoom-purpose-lineage/);

const packageManifest = JSON.parse(fs.readFileSync(packagePath, "utf8"));
assert.equal(packageManifest.name, "purpose-atlas-registry-dev");
assert.equal(packageManifest.scripts.dev, "vite --host 127.0.0.1 --port 18083 --strictPort");
assert.equal(packageManifest.scripts["verify:dev"], "npm run build && node --test test/a2ui-surface.test.mjs");

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
assertNoForbiddenKeys("Purpose Atlas fixture data", atlasData);

const goldenLock = JSON.parse(fs.readFileSync(goldenLockPath, "utf8"));
for (const [file, expected] of Object.entries(goldenLock.sourceFilesSha256)) {
  assert.equal(
    sha256File(path.join(atlasRoot, "golden/source", file)),
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
assert.deepEqual(purposeAtlasHtmlBox.assets, ["tests/fixtures/purpose-atlas-v6-a2ui/registry/index.html"]);
assert.deepEqual(atlasEntry.adapterAssets.html, ["tests/fixtures/purpose-atlas-v6-a2ui/registry/index.html"]);

if (fs.existsSync(path.join(root, ".git"))) {
  const trackedAtlasFiles = execFileSync(
    "git",
    ["ls-files", "--", "tests/fixtures/purpose-atlas-v6-a2ui"],
    { cwd: root, encoding: "utf8" },
  ).trim().split(/\r?\n/).filter(Boolean);
  assert.equal(trackedAtlasFiles.some((file) => /\/(?:dist|evidence)\//.test(file)), false, "generated outputs must not be tracked as fixture authority");
  assert.equal(trackedAtlasFiles.some((file) => file.endsWith("/MANIFEST.sha256")), false, "generated manifest must not be tracked as fixture authority");
} else {
  assert.equal(fs.existsSync(path.join(atlasRoot, "dist")), false, "generated dist must not be present in the source tree");
  assert.equal(fs.existsSync(path.join(atlasRoot, "evidence")), false, "generated evidence must not be present in the source tree");
  assert.equal(fs.existsSync(path.join(atlasRoot, "MANIFEST.sha256")), false, "generated manifest must not be present in the source tree");
}

const atlasFiles = collectFiles(atlasRoot);
assert.deepEqual(
  atlasFiles.filter((file) => file.toLowerCase().endsWith(".png")),
  [],
  "Purpose Atlas preview evidence must remain HTML/JSONL based and must not depend on PNG artifacts",
);

console.log(JSON.stringify({
  status: "purpose-atlas-a2ui-check-pass",
  surface: "purpose-atlas",
  component: "AtlasSourceSurface",
  actions: actionNames.length,
}, null, 2));
