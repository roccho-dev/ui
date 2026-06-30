import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-zip-interaction-'));
execFileSync(process.execPath, ['packages/a2ui-adapter-artifacts/scripts/build-geomap-zip-parity.mjs'], {cwd: root, stdio: 'inherit', env: {...process.env, UI_REPO_ROOT: root, GEOMAP_ZIP_PARITY_ARTIFACT_OUT: out, GEOMAP_ZIP_PARITY_RENDER: '1', GEOMAP_ZIP_PARITY_INTERACTION: '1'}});

for (const file of ['screenshots/interaction-tabs.png', 'screenshots/interaction-filtered.png', 'screenshots/interaction-detail-after-marker.png', 'proof/interaction-parity-report.json']) {
  assert.equal(fs.existsSync(path.join(out, file)), true, file);
}
const report = JSON.parse(fs.readFileSync(path.join(out, 'proof/interaction-parity-report.json'), 'utf8'));
assert.equal(report.status, 'property-map-interaction-parity-pass');
assert.equal(report.checks.tabsClickProof, true);
assert.equal(report.checks.markerSelectionProof, true);
assert.equal(report.checks.filtersSortProof, true);
assert.equal(report.checks.dataApplyResetProof, true);
console.log('geomap-interaction-parity-check-pass');
