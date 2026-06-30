import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-geomap-runtime-'));
execFileSync(process.execPath, ['packages/a2ui-adapter-artifacts/scripts/build-geomap-runtime-hardening.mjs'], {cwd: root, stdio: 'inherit', env: {...process.env, UI_REPO_ROOT: root, GEOMAP_ARTIFACT_OUT: out}});

const reportFile = path.join(out, 'proof/geomap-runtime-hardening-report.json');
assert.equal(fs.existsSync(reportFile), true, 'runtime hardening report is required');
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
assert.equal(report.status, 'geomap-runtime-hardening-pass');
assert.equal(report.checks.mountCreatedMapOnce, true);
assert.equal(report.checks.layerGroupsCreatedOncePerMount, true);
assert.equal(report.checks.hostTagged, true);
assert.equal(report.checks.repeatedUpdateNoDuplicateProperties, true);
assert.equal(report.checks.selectedOverlayReplacement, true);
assert.equal(report.checks.selectedMarkerStable, true);
assert.equal(report.checks.disposeClearsLayers, true);
assert.equal(report.checks.disposeRemountPass, true);
assert.equal(report.checks.fileOpenTileFallback, true);
assert.equal(report.checks.mapLibraryCallsOnlyInsideGeoMapPort, true);
assert.equal(report.checks.hostNodeCountGrowthWithinThreshold, true);
assert.equal(report.metrics.propertyMarkers, 28);
assert.equal(report.metrics.poiMarkersAfterSelection, 9);
assert.equal(report.metrics.radiusAfterSelection, 1);
assert.equal(report.metrics.linksAfterSelection, 9);
assert.equal(report.metrics.mapsCreatedAcrossRemount, 2);
assert.ok(report.metrics.repeatedHostNodeCounts.every((count) => count === 28));

console.log(JSON.stringify({status: 'geomap-runtime-hardening-check-pass', propertyMarkers: report.metrics.propertyMarkers, poiMarkersAfterSelection: report.metrics.poiMarkersAfterSelection}, null, 2));
