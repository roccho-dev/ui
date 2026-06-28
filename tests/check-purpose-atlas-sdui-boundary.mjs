import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const overlayRoot = fs.existsSync(path.join(root, 'repo-overlay')) ? path.join(root, 'repo-overlay') : root;

function read(relativePath) {
  return fs.readFileSync(path.join(overlayRoot, relativePath), 'utf8');
}

const surfaceText = read('tests/fixtures/purpose-atlas/surface.v0.9.jsonl');
const surfaceLines = surfaceText.trim().split(/\n+/).map((line) => JSON.parse(line));
const rootComponent = surfaceLines.find((line) => line.updateComponents).updateComponents.components[0];
const sduiDocument = rootComponent.document;
const sduiTree = JSON.stringify(sduiDocument.tree);
const sduiCss = sduiDocument.styles.css;

assert.equal(rootComponent.component, 'A2uiSduiSurface', 'surface JSONL must select the generic A2UI SDUI surface');
assert.ok(sduiDocument?.tree, 'surface JSONL must carry layout tree as the source of truth');
assert.ok(sduiDocument?.styles?.css, 'surface JSONL must carry CSS as the source of truth');
assert.match(sduiCss, /\.app/);
assert.match(sduiCss, /\.stage/);
assert.doesNotMatch(surfaceText, /functionCall|eval\(/i);

assert.match(sduiTree, /"port":"atlasStage"/, 'map-first SDUI must keep the atlasStage graph port');
assert.match(sduiTree, /"type":"slider"/, 'ADRS merge slide navigation must use an SDUI slider');
assert.match(sduiTree, /"when":"selectedNode"/, 'detail panel must render only after a target is selected');
assert.match(sduiTree, /"when":"notSelected"/, 'empty hint must render only before selection');
assert.match(sduiTree, /G0閉包: \{\{snapshot\.currentPurpose\}\}/, 'terminal objective context must remain visible in the map HUD');
assert.match(sduiTree, /ADRS merge slide/, 'user-facing timeline copy must describe slide semantics');
assert.match(sduiTree, /nodeを選択すると詳細を表示/, 'default map must tell the user how to open the detail panel');
assert.doesNotMatch(sduiTree, /Purpose Decision Atlas · SDUI/, 'long top explanation must not be part of the default map-first tree');
assert.doesNotMatch(sduiTree, /"className":"sdui-shell"/, 'default map-first layout must not reserve a permanent side shell');
assert.doesNotMatch(sduiTree, /"type":"segmented"/, 'approved repro UI must not add mode tabs');
assert.doesNotMatch(sduiTree, /onZoomIn|onZoomOut|onTogglePlay|onRecordMismatch|onRequestOwner|onHoldDecision/, 'approved repro UI keeps controls to slide and selection only');
assert.match(sduiCss, /grid-template-rows:minmax\(0,1fr\) 42px/, 'map must own the primary viewport row with a compact bottom rail');
assert.match(sduiCss, /\.stage-port,\.stage-port canvas\{position:absolute;inset:0/, 'atlasStage must fill the map stage');

assert.equal(fs.existsSync(path.join(overlayRoot, 'packages/purpose-atlas-preview/src/styles/source-ui.css')), false, 'legacy source-ui.css must be removed; SDUI JSONL owns CSS');

const oldAdapter = read('packages/purpose-atlas-preview/src/components/atlas-source-surface.js');
for (const token of ['topbar', 'purpose-card', 'workspace', 'timeline', 'source-ui.css']) {
  assert.ok(!oldAdapter.includes(token), `legacy AtlasSourceSurface adapter must not keep layout token ${token}`);
}

const renderer = read('packages/purpose-atlas-preview/src/components/a2ui-sdui-surface.js');
for (const token of ['class="topbar"', 'class="purpose-card"', 'class="workspace"', 'class="timeline"', 'source-ui.css']) {
  assert.ok(!renderer.includes(token), `A2UI SDUI renderer must not hard-code old layout token ${token}`);
}
assert.ok(renderer.includes('data-sdui-port="atlasStage"'), 'renderer may keep a low-level atlas stage port only');
assert.ok(renderer.includes('cleanCss'), 'renderer must validate SDUI CSS before injecting it');
assert.ok(renderer.includes('selectedNode'), 'renderer must expose selected node state for selection-only SDUI panels');
assert.ok(renderer.includes('gapCount'), 'renderer must expose derived active gap count for approved HUD');

const apis = read('packages/purpose-atlas-preview/src/a2ui/apis.js');
assert.ok(apis.includes("name: 'A2uiSduiSurface'"), 'component API must expose the SDUI component');
assert.ok(apis.includes('document: z.any()'), 'component API must accept an SDUI document payload');

console.log(JSON.stringify({status: 'purpose-atlas-sdui-boundary-pass'}, null, 2));
