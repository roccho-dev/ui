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

assert.equal(rootComponent.component, 'A2uiSduiSurface', 'surface JSONL must select the generic A2UI SDUI surface');
assert.ok(rootComponent.document?.tree, 'surface JSONL must carry layout tree as the source of truth');
assert.ok(rootComponent.document?.styles?.css, 'surface JSONL must carry CSS as the source of truth');
assert.match(rootComponent.document.styles.css, /\.sdui-app/);
assert.match(rootComponent.document.styles.css, /\.sdui-stage/);
assert.doesNotMatch(surfaceText, /functionCall|eval\(/i);

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

const apis = read('packages/purpose-atlas-preview/src/a2ui/apis.js');
assert.ok(apis.includes("name: 'A2uiSduiSurface'"), 'component API must expose the SDUI component');
assert.ok(apis.includes('document: z.any()'), 'component API must accept an SDUI document payload');

console.log(JSON.stringify({status: 'purpose-atlas-sdui-boundary-pass'}, null, 2));
