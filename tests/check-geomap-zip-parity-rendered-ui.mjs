import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.GEOMAP_ZIP_PARITY_ARTIFACT_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'ui-zip-rendered-'));
if (!process.env.GEOMAP_ZIP_PARITY_ARTIFACT_OUT) {
  execFileSync(process.execPath, ['packages/a2ui-adapter-artifacts/scripts/build-geomap-zip-parity.mjs'], {cwd: root, stdio: 'inherit', env: {...process.env, UI_REPO_ROOT: root, GEOMAP_ZIP_PARITY_ARTIFACT_OUT: out, GEOMAP_ZIP_PARITY_RENDER: '1'}});
}
for (const file of ['screenshots/rendered-collapsed.png', 'screenshots/rendered-open.png', 'screenshots/rendered-detail.png', 'proof/rendered-ui-report.json']) assert.equal(fs.existsSync(path.join(out, file)), true, file);
for (const file of ['screenshots/rendered-collapsed.png', 'screenshots/rendered-open.png', 'screenshots/rendered-detail.png']) {
  const data = fs.readFileSync(path.join(out, file));
  assert.ok(data.length > 10000, file + ' must be a real browser PNG');
  assert.equal(data.subarray(1, 4).toString('ascii'), 'PNG');
}
const preview = fs.readFileSync(path.join(out, 'preview/index.html'), 'utf8');
assert.match(preview, /leaflet@1\.9\.4\/dist\/leaflet\.js/);
assert.match(preview, /tile\.openstreetmap\.org/);
assert.doesNotMatch(preview, /local-readable-basemap|data-map-tile|dom-fallback|about:blank/);
const report = JSON.parse(fs.readFileSync(path.join(out, 'proof/rendered-ui-report.json'), 'utf8'));
assert.equal(report.status, 'zip-a2ui-rendered-ui-pass');
assert.equal(report.checks.noJsErrors, true);
assert.equal(report.checks.leafletProvider, true);
assert.equal(report.checks.leafletContainerVisible, true);
assert.equal(report.checks.osmTilesLoaded, true);
assert.equal(report.checks.osmAttributionVisible, true);
assert.equal(report.checks.fallbackUsed, false);
assert.equal(report.checks.initialCollapsedSheetPass, true);
assert.equal(report.checks.openSheetPass, true);
assert.equal(report.checks.detailInteractionPass, true);
assert.equal(report.checks.textOnlyMarkerDetected, false);
assert.ok(report.checks.propertyMarkersVisible >= 4);
assert.ok(report.checks.mapLabelsVisible >= 4);
assert.equal(report.checks.tabsVisibleAfterOpen, 7);
assert.ok(report.checks.propertyRowsVisibleAfterOpen >= 28);
assert.ok(report.checks.poiMarkersAfterSelect >= 9);
assert.ok(report.checks.radiusAfterSelect >= 1);
assert.ok(report.checks.linksAfterSelect >= 9);
assert.equal(report.checks.screenshotsGenerated, true);
console.log(JSON.stringify({status: 'geomap-zip-rendered-ui-check-pass', report: report.status, provider: 'leaflet-osm'}, null, 2));
