import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-preview-digest-'));
const input = path.join(root, 'tests/fixtures/repo-map/external-world.valid.jsonl');
const runtime = path.join(root, 'packages/a2ui-adapter-artifacts/repo-map-svgpanzoom/test/svg-pan-zoom-runtime.stub.js');
const env = { ...process.env, REPO_MAP_SVGPANZOOM_RUNTIME: runtime };

execFileSync(process.execPath, ['packages/a2ui-adapter-artifacts/scripts/watch-repo-map-svgpanzoom.mjs', '--once', '--out', out, '--input-jsonl', input], { cwd: root, env, stdio: 'pipe' });
const uiReceipt = JSON.parse(fs.readFileSync(path.join(out, 'proof/hot-reload-preview.json'), 'utf8'));
const preview = path.join(out, 'preview/index.html');
const opsReceipt = {
  kind: 'ops.crossRepoEditorToUiReceipt.v1',
  status: 'PASS',
  previewDigest: uiReceipt.generatedPreviewDigest,
  generatedArtifactsAreAuthority: false,
  uiWritesAuthority: false
};
const receiptPath = path.join(out, 'proof/ops-cross-repo-receipt.match.json');
fs.writeFileSync(receiptPath, JSON.stringify(opsReceipt, null, 2) + '\n', 'utf8');

const ok = execFileSync(process.execPath, ['scripts/verify-repo-map-preview-digest.mjs', '--receipt', receiptPath, '--preview', preview], { cwd: root, stdio: 'pipe' }).toString('utf8');
const result = JSON.parse(ok);
assert.equal(result.kind, 'ui.previewDigestVerification.v1');
assert.equal(result.status, 'PASS');
assert.equal(result.actualDigest, opsReceipt.previewDigest);
assert.equal(result.expectedDigest, opsReceipt.previewDigest);
assert.equal(result.authority, false);
assert.equal(result.readOnly, true);

const mismatchReceiptPath = path.join(out, 'proof/ops-cross-repo-receipt.mismatch.json');
fs.writeFileSync(mismatchReceiptPath, JSON.stringify({ ...opsReceipt, previewDigest: 'sha256:mismatch' }, null, 2) + '\n', 'utf8');
assert.throws(() => execFileSync(process.execPath, ['scripts/verify-repo-map-preview-digest.mjs', '--receipt', mismatchReceiptPath, '--preview', preview], { cwd: root, stdio: 'pipe' }), /preview digest mismatch|Command failed/);

const script = fs.readFileSync(path.join(root, 'scripts/verify-repo-map-preview-digest.mjs'), 'utf8');
assert.doesNotMatch(script, /appendQueue|writeAcceptedLedger|performAdmission|admitModelCommit|promoteProposal/i);

console.log(JSON.stringify({ status: 'ui-preview-digest-ops-receipt-check-pass' }, null, 2));
