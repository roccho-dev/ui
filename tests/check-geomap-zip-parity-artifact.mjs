import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-zip-parity-'));
execFileSync(process.execPath, ['packages/a2ui-adapter-artifacts/scripts/build-geomap-zip-parity.mjs'], {cwd: root, stdio: 'inherit', env: {...process.env, UI_REPO_ROOT: root, GEOMAP_ZIP_PARITY_ARTIFACT_OUT: out}});

for (const file of [
  'dist/a2ui/property-map-zip-parity.surface.v1.jsonl',
  'dist/data/property-map-zip-parity.seed.v1.json',
  'dist/data/property-map-zip-parity.data.v1.json',
  'dist/registry/property-map-component-registry.v2.json',
  'runtime/geo-map-port.js',
  'reference/zip-visual-oracle/visual-contract.json',
  'preview/index.html',
  'screenshots/generated-mobile.svg',
  'proof/zip-visual-parity-report.json'
]) assert.equal(fs.existsSync(path.join(out, file)), true, file);

for (const removed of ['preview/file-open-offline-proof.html', 'preview/file-open-cdn-fixed.html']) {
  assert.equal(fs.existsSync(path.join(out, removed)), false, `${removed} must not exist as alternate visible UI`);
}

const html = fs.readFileSync(path.join(out, 'preview/index.html'), 'utf8');
assert.doesNotMatch(html, /https?:\/\//);
assert.doesNotMatch(html, /type="module"/);
assert.doesNotMatch(html, /<pre/i);
assert.doesNotMatch(html, /file-open-offline-proof/);
assert.match(html, /data-a2ui-surface="property-map-zip-parity"/);
assert.match(html, /GeoMapPort/);
for (const text of ['比較', '詳細', '費用', '要件', '監視', '退避', 'JSON', '開く', '28件', '格安レンタカー', '大宮駅', '熊谷駅', 'ラフォーレASUKA F棟 1階']) assert.match(html, new RegExp(text));

const model = JSON.parse(fs.readFileSync(path.join(out, 'dist/data/property-map-zip-parity.data.v1.json'), 'utf8'));
assert.equal(model.data.properties.length, 28);
assert.equal(model.data.watchlist_properties.length, 6);
assert.equal(model.data.quarantined_properties.length, 9);
assert.equal(model.data.requirement_matrix.length, 87);
assert.equal(model.data.content_blocks.length, 11);
assert.deepEqual(model.sdui.navigation.tabs.map((tab) => tab.label), ['比較', '詳細', '費用', '要件', '監視', '退避', 'JSON']);
assert.ok(model.data.properties.every((item) => item.nearby.daily_use_rental_car), 'daily_use_rental_car key is required for active properties');
assert.ok(model.data.properties.every((item) => item.access.regional_nodes.omiya && item.access.regional_nodes.kumagaya), '大宮/熊谷 access is required');

const registry = JSON.parse(fs.readFileSync(path.join(out, 'dist/registry/property-map-component-registry.v2.json'), 'utf8'));
const oracle = JSON.parse(fs.readFileSync(path.join(out, 'reference/zip-visual-oracle/visual-contract.json'), 'utf8'));
const registryIds = new Set(registry.components.map((item) => item.id));
for (const component of oracle.components) assert.equal(registryIds.has(component), true, component);

const proof = JSON.parse(fs.readFileSync(path.join(out, 'proof/zip-visual-parity-report.json'), 'utf8'));
assert.equal(proof.status, 'zip-a2ui-parity-pass');
assert.equal(proof.checks.a2uiOnlySourceAuthority, true);
assert.equal(proof.checks.zipHtmlTemplateNotSourceAuthority, true);
assert.equal(proof.checks.registryCoversZipComponents, true);
assert.equal(proof.checks.tabs, 7);
assert.equal(proof.checks.activeProperties, 28);
assert.equal(proof.checks.watchlistProperties, 6);
assert.equal(proof.checks.quarantinedProperties, 9);
assert.equal(proof.checks.requirementMatrix, 87);
assert.equal(proof.checks.contentBlocks, 11);
assert.equal(proof.checks.dailyUseRentalCarForAllActive, true);
assert.equal(proof.checks.regionalAccessForAllActive, true);
assert.equal(proof.checks.surfaceUsesA2ui, true);
assert.equal(proof.checks.generatedHtmlNoExternalAsset, true);
assert.equal(proof.checks.generatedHtmlZipVisualKeys, true);
assert.equal(proof.checks.generatedHtmlUsesGeoMapPortBoundary, true);
console.log(JSON.stringify({status: 'geomap-zip-parity-artifact-check-pass', activeProperties: proof.checks.activeProperties, tabs: proof.checks.tabs, components: oracle.components.length + '/' + registry.components.length}, null, 2));
