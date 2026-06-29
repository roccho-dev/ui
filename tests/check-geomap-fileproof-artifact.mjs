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
  'screenshots/clear.svg',
  'screenshots/after-click.svg',
  'proof/geomap-proof-report.json',
]) assert.equal(fs.existsSync(path.join(out, file)), true, file);

for (const removed of ['preview/file-open-offline-proof.html', 'preview/file-open-cdn-fixed.html']) {
  assert.equal(fs.existsSync(path.join(out, removed)), false, `${removed} must not exist as alternate visible UI`);
}

const html = fs.readFileSync(path.join(out, 'preview/index.html'), 'utf8');
assert.doesNotMatch(html, /type="module"/);
assert.doesNotMatch(html, /src="\.\//);
assert.doesNotMatch(html, /https?:\/\//);
assert.doesNotMatch(html, /<pre>/);
assert.doesNotMatch(html, /Property 1/);
assert.doesNotMatch(html, /file-open-offline-proof/);
assert.doesNotMatch(html, /file-open-cdn-fixed/);
assert.match(html, /geomap-canonical-ui-pass/);
assert.match(html, /埼玉・群馬 物件周辺マップ/);
assert.match(html, /グロワールいとう/);
assert.match(html, /セラヴィ伊勢崎A/);
assert.match(html, /地図で見る/);
assert.match(html, /🏠/);
assert.match(html, /GeoMapPort/);

const clearRows = fs.readFileSync(path.join(out, 'dist/a2ui/property-map.data.clear.v0.9.jsonl'), 'utf8').trim().split(/\n+/).map((line) => JSON.parse(line));
const properties = clearRows.find((row) => row.updateDataModel?.path === '/properties').updateDataModel.value;
const poiKeys = clearRows.find((row) => row.updateDataModel?.path === '/requirements').updateDataModel.value.nearby_icon_categories;
assert.ok(properties.length >= 10);
assert.ok(poiKeys.length >= 9);
assert.ok(properties.every((item) => !/^Property /.test(item.name)), 'dummy property names must not remain');
assert.ok(properties.some((item) => item.name === 'グロワールいとう'));
assert.ok(properties.some((item) => item.name === 'セラヴィ伊勢崎A'));
assert.ok(properties.every((item) => Number.isFinite(item.rent_yen)), 'rent label data is required');
assert.ok(properties.every((item) => Number.isFinite(item.area_sqm)), 'area label data is required');
assert.ok(poiKeys.every((key) => properties[0].nearby && properties[0].nearby[key]), 'selected fixture property must have visible POI data for every required key');

const report = JSON.parse(fs.readFileSync(path.join(out, 'proof/geomap-proof-report.json'), 'utf8'));
assert.equal(report.status, 'geomap-canonical-ui-pass');
assert.equal(report.checks.singleCanonicalUi, true);
assert.equal(report.checks.noAlternateVisibleProofHtml, true);
assert.equal(report.checks.noBlankScreen, true);
assert.equal(report.checks.noModuleScript, true);
assert.equal(report.checks.noRelativeImport, true);
assert.equal(report.checks.canonicalNoCdn, true);
assert.equal(report.checks.geoMapPortExecuted, true);
assert.equal(report.checks.bottomSheetMode, true);
assert.ok(report.checks.mapVisibleRatio >= 0.6);
assert.equal(report.checks.sheetDoesNotCoverMarkers, true);
assert.ok(report.checks.houseMarkerLabels >= 4);
assert.ok(report.checks.propertyCards >= 10);
assert.equal(report.checks.japanesePropertyNames, true);
assert.equal(report.checks.rentLabels, true);
assert.ok(report.checks.mapActionButtons >= 10);
assert.equal(report.checks.detailBeforeClick, false);
assert.equal(report.checks.markerClickUpdatesSelection, true);
assert.equal(report.checks.detailAfterClick, true);
assert.ok(report.checks.poiMarkersAfterClick >= 9);
assert.ok(report.checks.radiusAfterClick >= 1);
assert.ok(report.checks.linksAfterClick >= 9);
assert.equal(report.checks.mapLibraryCallsOnlyInsideGeoMapPort, true);
assert.equal(report.checks.sduiHasNoMapLibraryCalls, true);
assert.equal(report.checks.screenshots.clear, true);
assert.equal(report.checks.screenshots.afterClick, true);

console.log(JSON.stringify({status: 'geomap-canonical-ui-artifact-check-pass', propertyCards: report.checks.propertyCards, houseMarkerLabels: report.checks.houseMarkerLabels, mapActionButtons: report.checks.mapActionButtons}, null, 2));
