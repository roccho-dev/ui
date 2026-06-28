import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-geomap-proof-'));
execFileSync(process.execPath, ['packages/a2ui-adapter-artifacts/scripts/build-geomap-proof.mjs'], {cwd: root, stdio: 'inherit', env: {...process.env, UI_REPO_ROOT: root, GEOMAP_ARTIFACT_OUT: out}});

for (const file of [
  'dist/a2ui/property-map.surface.v0.9.jsonl',
  'dist/a2ui/property-map.data.clear.v0.9.jsonl',
  'dist/a2ui/property-map.data.selected.v0.9.jsonl',
  'dist/registry/shared-component-registry.v1.json',
  'runtime/geo-map-port.js',
  'preview/index.html',
  'preview/file-open-offline-proof.html',
  'preview/file-open-cdn-fixed.html',
  'screenshots/clear.svg',
  'screenshots/after-click.svg',
  'proof/geomap-proof-report.json',
]) assert.equal(fs.existsSync(path.join(out, file)), true, file);

const offline = fs.readFileSync(path.join(out, 'preview/file-open-offline-proof.html'), 'utf8');
assert.doesNotMatch(offline, /type="module"/);
assert.doesNotMatch(offline, /src="\.\//);
assert.doesNotMatch(offline, /https?:\/\//);
assert.doesNotMatch(offline, /<pre>/);
assert.match(offline, /geomap-fileproof-pass/);
assert.match(offline, /GeoMapPort/);
assert.match(offline, /height:66vh/);
assert.match(offline, /height:34vh/);
assert.match(offline, /bottom:0/);
assert.match(offline, /grid-template-columns:repeat\(5/);
assert.match(offline, /POI radius links visible/);

const report = JSON.parse(fs.readFileSync(path.join(out, 'proof/geomap-proof-report.json'), 'utf8'));
assert.equal(report.status, 'geomap-fileproof-pass');
assert.equal(report.checks.noBlankScreen, true);
assert.equal(report.checks.noModuleScript, true);
assert.equal(report.checks.noRelativeImport, true);
assert.equal(report.checks.offlineNoCdn, true);
assert.equal(report.checks.geoMapPortExecuted, true);
assert.equal(report.checks.bottomSheetMode, true);
assert.ok(report.checks.mapVisibleRatio >= 0.6);
assert.equal(report.checks.sheetDoesNotCoverMarkers, true);
assert.ok(report.checks.propertyMarkers >= 10);
assert.ok(report.checks.visiblePropertyMarkers >= 10);
assert.equal(report.checks.detailBeforeClick, false);
assert.equal(report.checks.markerClickUpdatesSelection, true);
assert.equal(report.checks.detailAfterClick, true);
assert.ok(report.checks.poiMarkersAfterClick >= 9);
assert.ok(report.checks.visiblePoiMarkersAfterClick >= 9);
assert.ok(report.checks.radiusAfterClick >= 1);
assert.ok(report.checks.linksAfterClick >= 9);
assert.ok(report.checks.visibleLinksAfterClick >= 9);
assert.equal(report.checks.mapLibraryCallsOnlyInsideGeoMapPort, true);
assert.equal(report.checks.sduiHasNoMapLibraryCalls, true);
assert.equal(report.checks.screenshots.clear, true);
assert.equal(report.checks.screenshots.afterClick, true);

console.log(JSON.stringify({status: 'geomap-fileproof-artifact-check-pass', propertyMarkers: report.checks.propertyMarkers, poiMarkersAfterClick: report.checks.poiMarkersAfterClick, linksAfterClick: report.checks.linksAfterClick, mapVisibleRatio: report.checks.mapVisibleRatio}, null, 2));
