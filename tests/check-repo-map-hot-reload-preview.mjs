import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-map-hot-reload-'));
const input = path.join(root, 'tests/fixtures/repo-map/external-world.valid.jsonl');
const runtime = path.join(root, 'packages/a2ui-adapter-artifacts/repo-map-svgpanzoom/test/svg-pan-zoom-runtime.stub.js');
const env = { ...process.env, REPO_MAP_SVGPANZOOM_RUNTIME: runtime };
execFileSync(process.execPath, ['packages/a2ui-adapter-artifacts/scripts/watch-repo-map-svgpanzoom.mjs', '--once', '--out', out, '--input-jsonl', input], { cwd: root, env, stdio: 'pipe' });
const html = fs.readFileSync(path.join(out, 'preview/index.html'), 'utf8');
assert.match(html, /repo-map-hot-reload-client/);
assert.match(html, /EventSource/);
assert.match(html, /__repo_map_events/);
const receipt = JSON.parse(fs.readFileSync(path.join(out, 'proof/hot-reload-preview.json'), 'utf8'));
assert.equal(receipt.kind, 'ui.repoMapHotReloadPreview.v1');
assert.equal(receipt.localhostOnly, true);
assert.equal(receipt.generatedArtifactsAreAuthority, false);
assert.ok(receipt.sourceProjectionDigest.startsWith('sha256:'));
assert.ok(receipt.generatedPreviewDigest.startsWith('sha256:'));
assert.equal(receipt.generatedArtifactDigest, receipt.generatedPreviewDigest);

const afterInput = path.join(os.tmpdir(), `repo-map-hot-reload-after-${process.pid}.jsonl`);
fs.writeFileSync(afterInput, fs.readFileSync(input, 'utf8').replace('external.git', 'external-after.git'), 'utf8');
const afterOut = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-map-hot-reload-after-'));
execFileSync(process.execPath, ['packages/a2ui-adapter-artifacts/scripts/watch-repo-map-svgpanzoom.mjs', '--once', '--out', afterOut, '--input-jsonl', afterInput], { cwd: root, env, stdio: 'pipe' });
const afterReceipt = JSON.parse(fs.readFileSync(path.join(afterOut, 'proof/hot-reload-preview.json'), 'utf8'));
assert.notEqual(receipt.sourceProjectionDigest, afterReceipt.sourceProjectionDigest);
assert.notEqual(receipt.generatedPreviewDigest, afterReceipt.generatedPreviewDigest);
assert.equal(afterReceipt.localhostOnly, true);
assert.equal(afterReceipt.generatedArtifactsAreAuthority, false);

console.log(JSON.stringify({ status: 'repo-map-hot-reload-preview-check-pass', digestProof: true }, null, 2));
