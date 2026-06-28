import assert from "node:assert/strict";
import { defaultRegistry, purposeAtlasHtmlBox } from "#core-port";

const registry = defaultRegistry();
const sduiEntry = registry.get("A2uiSduiSurface");
assert.ok(sduiEntry);
assert.equal(sduiEntry.family, "purpose_atlas");
assert.ok(sduiEntry.props.includes("document"));
const atlasEntry = registry.get("AtlasSourceSurface");
assert.ok(atlasEntry);
assert.equal(atlasEntry.family, "purpose_atlas");
assert.equal(purposeAtlasHtmlBox.accepts, "a2ui.surface.v0.9");
console.log("debug-purpose-atlas-registry-pass");
