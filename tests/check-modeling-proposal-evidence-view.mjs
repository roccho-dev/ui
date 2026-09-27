import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'modeling-proposal-evidence-'));
const input = path.join(root, 'tests/fixtures/modeling-proposal/modeling-proposal.valid.json');
execFileSync(process.execPath, ['scripts/build-modeling-proposal-evidence.mjs', '--input', input, '--out', out], { cwd: root, stdio: 'pipe' });

const html = fs.readFileSync(path.join(out, 'preview/index.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(out, 'proof/manifest.json'), 'utf8'));
const doc = fs.readFileSync(path.join(root, 'docs/modeling-proposal-evidence-view.md'), 'utf8');

assert.match(html, /Modeling proposal evidence/);
assert.match(html, /data-kind="modeling\.proposal\.v1"/);
assert.match(html, /data-authority="false"/);
assert.match(html, /data-proposal-display-only="true"/);
assert.match(html, /proposal-ui-evidence-260709/);
assert.match(html, /projectionNode:repo:ops-fixture/);
assert.match(html, /repoMap\.addEdge\.v1/);
assert.match(html, /pkg:core -> pkg:ui uses/);
assert.match(html, /non-authority evidence/);
assert.doesNotMatch(html, /<button/i);
assert.doesNotMatch(html, /data-action|approveModelCommit|promoteProposal|admitModelCommit|writeAcceptedLedger|appendQueue/i);

assert.equal(manifest.kind, 'ui.modelingProposalEvidenceManifest.v1');
assert.equal(manifest.issue, 'roccho-dev/ui#133');
assert.equal(manifest.authority, false);
assert.equal(manifest.proposalDisplayOnly, true);
assert.equal(manifest.generatedArtifactsAreAuthority, false);
assert.equal(manifest.promotionOwner, 'ops');
assert.ok(manifest.inputDigest.startsWith('sha256:'));

assert.match(doc, /non-authority/);
assert.match(doc, /Promotion belongs to ops/);
assert.match(doc, /UI is only a read-only evidence view/);
assert.match(doc, /approve button/);
assert.match(doc, /accepted ledger write button/);

console.log(JSON.stringify({ status: 'modeling-proposal-evidence-view-check-pass' }, null, 2));
