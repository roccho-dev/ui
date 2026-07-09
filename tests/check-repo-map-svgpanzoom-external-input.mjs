import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'packages/a2ui-adapter-artifacts/scripts/build-repo-map-svgpanzoom.mjs');
const runtime = path.join(root, 'packages/a2ui-adapter-artifacts/repo-map-svgpanzoom/test/svg-pan-zoom-runtime.stub.js');
const env = { ...process.env, REPO_MAP_SVGPANZOOM_RUNTIME: runtime };

const fixtureOut = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-map-fixture-'));
execFileSync(process.execPath, [script, '--out', fixtureOut], { cwd: root, env, stdio: 'pipe' });
const fixtureManifest = readManifest(fixtureOut);
assert.equal(fixtureManifest.inputContract.mode, 'fixture-jsonl');
assert.equal(fixtureManifest.inputContract.provider, 'built-in-fixture');
assert.ok(fixtureManifest.inputContract.sha256.startsWith('sha256:'));
assert.equal(fs.existsSync(path.join(fixtureOut, fixtureManifest.inputContract.sourceCopy)), true);
assert.equal(fixtureManifest.generatedArtifactsAreAuthority, false);

const jsonlInput = path.join(root, 'tests/fixtures/repo-map/external-world.valid.jsonl');
const jsonlOut = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-map-jsonl-'));
execFileSync(process.execPath, [script, '--out', jsonlOut, '--input-jsonl', jsonlInput], { cwd: root, env, stdio: 'pipe' });
const jsonlManifest = readManifest(jsonlOut);
assert.equal(jsonlManifest.inputContract.mode, 'external-jsonl');
assert.equal(jsonlManifest.inputContract.path, jsonlInput);
assert.equal(jsonlManifest.inputContract.sourceCopy, 'source/repo-map-input.jsonl');
assert.equal(fs.readFileSync(path.join(jsonlOut, jsonlManifest.inputContract.sourceCopy), 'utf8'), fs.readFileSync(jsonlInput, 'utf8'));
assert.equal(jsonlManifest.generatedArtifactsAreAuthority, false);

const projectionInput = path.join(os.tmpdir(), `repo-map-projection-${process.pid}.json`);
fs.writeFileSync(projectionInput, JSON.stringify({
  kind: 'projection.view.v1',
  camera: { z: 42, focusId: 'repo:projection-00', selectedId: null },
  policy: { world: { x: 0, y: 0, w: 640, h: 420 }, camera: { z: 0, minZ: 0, maxZ: 100, svgPanZoomMaxZoom: 8 }, font: { basePx: 15, minPx: 4, maxPx: 16, zoomGain: 0.12, depthDecay: 0.7 }, edge: { maxVisibleRepo: 9, maxVisiblePackage: 16, maxVisibleModel: 24 } },
  nodes: [{ kind: 'map.node.v1', id: 'repo:projection-00', role: 'repo', depth: 0, rect: { x: 20, y: 20, w: 400, h: 240 }, style: { strokeWidth: 2, fill: 'none' } }],
  edges: []
}, null, 2) + '\n');
const projectionOut = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-map-projection-'));
execFileSync(process.execPath, [script, '--out', projectionOut, '--projection', projectionInput], { cwd: root, env, stdio: 'pipe' });
const projectionManifest = readManifest(projectionOut);
assert.equal(projectionManifest.inputContract.mode, 'external-projection-json');
assert.equal(projectionManifest.inputContract.sourceCopy, 'source/repo-map-input.projection.json');
assert.equal(fs.existsSync(path.join(projectionOut, 'preview/index.html')), true);

const opsProjectionInput = path.join(root, 'tests/fixtures/repo-map/ops-projection-artifact.valid.json');
const opsProjectionOut = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-map-ops-projection-'));
execFileSync(process.execPath, [script, '--out', opsProjectionOut, '--projection', opsProjectionInput], { cwd: root, env, stdio: 'pipe' });
const opsProjectionManifest = readManifest(opsProjectionOut);
const opsProjectionSource = JSON.parse(fs.readFileSync(path.join(opsProjectionOut, opsProjectionManifest.inputContract.sourceCopy), 'utf8'));
assert.equal(opsProjectionManifest.inputContract.mode, 'external-projection-json');
assert.equal(opsProjectionManifest.inputContract.provider, 'external-path');
assert.equal(opsProjectionManifest.inputContract.path, opsProjectionInput);
assert.equal(opsProjectionManifest.inputContract.sourceCopy, 'source/repo-map-input.projection.json');
assert.ok(opsProjectionManifest.inputContract.sha256.startsWith('sha256:'));
assert.equal(opsProjectionSource.kind, 'ops.repoMapProjectionArtifact.v1');
assert.equal(opsProjectionSource.provider, 'roccho-dev/ops#43');
assert.equal(opsProjectionSource.generatedArtifactsAreAuthority, false);
assert.equal(fs.existsSync(path.join(opsProjectionOut, 'preview/index.html')), true);
assert.equal(opsProjectionManifest.generatedArtifactsAreAuthority, false);

const badInput = path.join(os.tmpdir(), `repo-map-bad-${process.pid}.jsonl`);
fs.writeFileSync(badInput, '{"kind":\n');
assert.throws(() => execFileSync(process.execPath, [script, '--out', fs.mkdtempSync(path.join(os.tmpdir(), 'repo-map-bad-')), '--input-jsonl', badInput], { cwd: root, env, stdio: 'pipe' }), /JSONL parse error|Command failed/);

console.log(JSON.stringify({ status: 'repo-map-svgpanzoom-external-input-check-pass', opsProjectionArtifactInput: true }, null, 2));
function readManifest(out) { return JSON.parse(fs.readFileSync(path.join(out, 'proof/manifest.json'), 'utf8')); }
