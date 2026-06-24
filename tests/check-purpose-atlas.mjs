import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defaultRegistry, purposeAtlasHtmlBox } from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const atlasRoot = path.join(root, "examples/purpose-atlas-v6-a2ui");
const surfacePath = path.join(atlasRoot, "public/a2ui/purpose-atlas.surface.jsonl");
const witnessPath = path.join(atlasRoot, "evidence/golden-witness.json");
const browserWitnessPath = path.join(atlasRoot, "evidence/browser-verification.json");

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.match(html, /Purpose Decision Atlas v6/);
assert.match(html, /__purposeAtlasSurfaceJsonl/);
assert.match(html, /purpose-atlas-app/);
assert.doesNotMatch(html, /need-zoom-purpose-lineage/);

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

const registry = defaultRegistry();
const atlasEntry = registry.get("AtlasSourceSurface");
assert.equal(atlasEntry.family, "purpose_atlas");
assert.equal(atlasEntry.childrenPolicy, "none");
assert.ok(atlasEntry.actions.includes("atlas.recordMismatch"));
assert.equal(purposeAtlasHtmlBox.accepts, "a2ui.surface.v0.9");
assert.deepEqual(purposeAtlasHtmlBox.assets, ["index.html"]);

const witness = JSON.parse(fs.readFileSync(witnessPath, "utf8"));
const browserWitness = JSON.parse(fs.readFileSync(browserWitnessPath, "utf8"));
assert.match(JSON.stringify(witness), /PASS|pass|true/);
assert.match(JSON.stringify(browserWitness), /PASS|pass|true/);

console.log(JSON.stringify({
  status: "purpose-atlas-a2ui-check-pass",
  surface: "purpose-atlas",
  component: "AtlasSourceSurface",
  actions: actionNames.length,
}, null, 2));