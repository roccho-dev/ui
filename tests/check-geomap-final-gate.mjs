import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-final-gate-'));
const zipOut = path.join(tmp, 'property-map-zip-parity-artifact');
const runtimeOut = path.join(tmp, 'property-map-geo-runtime-hardening-artifact');
execFileSync(process.execPath, ['packages/a2ui-adapter-artifacts/scripts/build-geomap-zip-parity.mjs'], {cwd: root, stdio: 'inherit', env: {...process.env, UI_REPO_ROOT: root, GEOMAP_ZIP_PARITY_ARTIFACT_OUT: zipOut, GEOMAP_ZIP_PARITY_RENDER: '1', GEOMAP_ZIP_PARITY_INTERACTION: '1'}});
execFileSync(process.execPath, ['packages/a2ui-adapter-artifacts/scripts/build-geomap-runtime-hardening.mjs'], {cwd: root, stdio: 'inherit', env: {...process.env, UI_REPO_ROOT: root, GEOMAP_ARTIFACT_OUT: runtimeOut}});
execFileSync(process.execPath, ['packages/a2ui-adapter-artifacts/scripts/check-geomap-final-gate.mjs'], {cwd: root, stdio: 'inherit', env: {...process.env, UI_REPO_ROOT: root, GEOMAP_ZIP_PARITY_ARTIFACT_OUT: zipOut, GEOMAP_RUNTIME_ARTIFACT_OUT: runtimeOut}});

const report = JSON.parse(fs.readFileSync(path.join(zipOut, 'proof/final-gate-report.json'), 'utf8'));
assert.equal(report.status, 'property-map-final-gate-pass');
assert.equal(report.checks.staticReportPass, true);
assert.equal(report.checks.renderedReportPass, true);
assert.equal(report.checks.interactionReportPass, true);
assert.equal(report.checks.runtimeReportPass, true);
assert.equal(report.checks.screenshotsPresent, true);
assert.equal(report.checks.singleVisibleHtml, true);
console.log(JSON.stringify({status: 'geomap-final-gate-check-pass', finalGate: report.status}, null, 2));
